import { Router } from 'express';
import { csvImportRowSchema } from '@scythe/shared';
import { db } from '../db/index';
import { plots, deceasedPersons, csvImportJobs } from '../db/schema';
import { AppError } from '../middleware/errorHandler';
import { requireAuth } from '../middleware/auth';

const router = Router();

interface CsvRow {
  [key: string]: string;
}

interface ColumnMapping {
  firstName: string;
  lastName: string;
  dateOfBirth?: string;
  dateOfDeath?: string;
  section?: string;
  plotNumber?: string;
}

interface ValidatedRow {
  firstName: string;
  lastName: string;
  dateOfBirth?: string;
  dateOfDeath?: string;
  section?: string;
  plotNumber?: string;
}

interface RowError {
  row: number;
  errors: string[];
  data: Record<string, string>;
}

function parseCsvText(text: string): { headers: string[]; rows: CsvRow[] } {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = parseCsvLine(lines[0]!);
  const rows: CsvRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]!);
    const row: CsvRow = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]!] = values[j]?.trim() ?? '';
    }
    rows.push(row);
  }

  return { headers, rows };
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i]!;
    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
  }
  result.push(current.trim());
  return result;
}

function tryParseDate(value: string | undefined): string | undefined {
  if (!value || value.trim() === '') return undefined;
  const trimmed = value.trim();

  // Try common date formats
  const date = new Date(trimmed);
  if (!isNaN(date.getTime())) {
    return date.toISOString();
  }

  // Try MM/DD/YYYY
  const mdyMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdyMatch) {
    const d = new Date(`${mdyMatch[3]}-${mdyMatch[1]!.padStart(2, '0')}-${mdyMatch[2]!.padStart(2, '0')}`);
    if (!isNaN(d.getTime())) return d.toISOString();
  }

  // Try year only
  const yearMatch = trimmed.match(/^(\d{4})$/);
  if (yearMatch) {
    return new Date(`${yearMatch[1]}-01-01`).toISOString();
  }

  return undefined;
}

// Validate CSV data with column mapping
router.post('/api/csv-import/validate', requireAuth, async (req, res, next) => {
  try {
    const { csvText, mapping } = req.body as { csvText: string; mapping: ColumnMapping };
    if (!csvText || !mapping) {
      throw new AppError(400, 'csvText and mapping are required');
    }

    const { rows } = parseCsvText(csvText);
    const validated: ValidatedRow[] = [];
    const errors: RowError[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!;
      const mapped = {
        firstName: row[mapping.firstName] ?? '',
        lastName: row[mapping.lastName] ?? '',
        dateOfBirth: mapping.dateOfBirth ? tryParseDate(row[mapping.dateOfBirth]) : undefined,
        dateOfDeath: mapping.dateOfDeath ? tryParseDate(row[mapping.dateOfDeath]) : undefined,
        section: mapping.section ? row[mapping.section] : undefined,
        plotNumber: mapping.plotNumber ? row[mapping.plotNumber] : undefined,
      };

      const result = csvImportRowSchema.safeParse(mapped);
      if (result.success) {
        validated.push(result.data);
      } else {
        const rowErrors: string[] = [];
        for (const issue of result.error.issues) {
          rowErrors.push(`${issue.path.join('.')}: ${issue.message}`);
        }
        // Check for unparseable dates
        if (mapping.dateOfBirth && row[mapping.dateOfBirth] && !mapped.dateOfBirth) {
          rowErrors.push(`dateOfBirth: Could not parse date "${row[mapping.dateOfBirth]}"`);
        }
        if (mapping.dateOfDeath && row[mapping.dateOfDeath] && !mapped.dateOfDeath) {
          rowErrors.push(`dateOfDeath: Could not parse date "${row[mapping.dateOfDeath]}"`);
        }
        errors.push({ row: i + 1, errors: rowErrors, data: row });
      }
    }

    res.json({
      totalRows: rows.length,
      validRows: validated.length,
      errorRows: errors.length,
      preview: validated.slice(0, 10),
      errors: errors.slice(0, 20),
    });
  } catch (err) {
    next(err);
  }
});

// Parse CSV headers for column mapping UI
router.post('/api/csv-import/parse-headers', requireAuth, async (req, res, next) => {
  try {
    const { csvText } = req.body as { csvText: string };
    if (!csvText) {
      throw new AppError(400, 'csvText is required');
    }

    const { headers, rows } = parseCsvText(csvText);
    res.json({
      headers,
      sampleRows: rows.slice(0, 3),
      totalRows: rows.length,
    });
  } catch (err) {
    next(err);
  }
});

// Execute CSV import
router.post('/api/csv-import/execute', requireAuth, async (req, res, next) => {
  try {
    const { csvText, mapping, cemeteryId, fileName } = req.body as {
      csvText: string;
      mapping: ColumnMapping;
      cemeteryId: string;
      fileName: string;
    };

    if (!csvText || !mapping || !cemeteryId) {
      throw new AppError(400, 'csvText, mapping, and cemeteryId are required');
    }

    const { rows } = parseCsvText(csvText);

    // Create import job record
    const [job] = await db
      .insert(csvImportJobs)
      .values({
        cemeteryId,
        fileName: fileName ?? 'import.csv',
        status: 'processing',
        totalRows: rows.length,
        processedRows: 0,
        errorRows: 0,
        uploadedBy: req.user!.id,
      })
      .returning();

    if (!job) {
      throw new AppError(500, 'Failed to create import job');
    }

    let processedCount = 0;
    let errorCount = 0;
    const importErrors: RowError[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!;
      const mapped = {
        firstName: row[mapping.firstName] ?? '',
        lastName: row[mapping.lastName] ?? '',
        dateOfBirth: mapping.dateOfBirth ? tryParseDate(row[mapping.dateOfBirth]) : undefined,
        dateOfDeath: mapping.dateOfDeath ? tryParseDate(row[mapping.dateOfDeath]) : undefined,
        section: mapping.section ? row[mapping.section] : undefined,
        plotNumber: mapping.plotNumber ? row[mapping.plotNumber] : undefined,
      };

      const result = csvImportRowSchema.safeParse(mapped);
      if (!result.success) {
        errorCount++;
        importErrors.push({
          row: i + 1,
          errors: result.error.issues.map((issue: { path: Array<string | number>; message: string }) => `${issue.path.join('.')}: ${issue.message}`),
          data: row,
        });
        continue;
      }

      try {
        // Create an unpinned plot (no GPS coordinates for CSV imports)
        const [plot] = await db
          .insert(plots)
          .values({
            cemeteryId,
            plotNumber: result.data.plotNumber ?? null,
            section: result.data.section ?? null,
            gpsSource: 'csv',
            status: 'unpinned',
          })
          .returning();

        if (!plot) {
          errorCount++;
          continue;
        }

        // Create the deceased person record
        await db.insert(deceasedPersons).values({
          cemeteryId,
          plotId: plot.id,
          firstName: result.data.firstName,
          lastName: result.data.lastName,
          dateOfBirth: result.data.dateOfBirth ? new Date(result.data.dateOfBirth) : null,
          dateOfDeath: result.data.dateOfDeath ? new Date(result.data.dateOfDeath) : null,
          isPubliclyVisible: true,
        });

        processedCount++;
      } catch {
        errorCount++;
        importErrors.push({
          row: i + 1,
          errors: ['Database error while inserting record'],
          data: row,
        });
      }
    }

    // Update job status
    const { eq } = await import('drizzle-orm');
    await db
      .update(csvImportJobs)
      .set({
        status: 'completed',
        processedRows: processedCount,
        errorRows: errorCount,
        updatedAt: new Date(),
      })
      .where(eq(csvImportJobs.id, job.id));

    res.json({
      jobId: job.id,
      totalRows: rows.length,
      imported: processedCount,
      skipped: errorCount,
      errors: importErrors,
    });
  } catch (err) {
    next(err);
  }
});

export { router as csvImportRouter };

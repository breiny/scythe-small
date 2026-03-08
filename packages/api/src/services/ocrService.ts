import type { OcrParsedPerson } from '@scythe/shared';

// ── Interface ────────────────────────────────────────────────────
// Clean interface so we can swap Textract for Google Vision later.

export interface OcrTextBlock {
  text: string;
  confidence: number;
}

export interface OcrExtractor {
  extractText(imageBuffer: Buffer): Promise<OcrTextBlock[]>;
}

export interface OcrParser {
  parseHeadstone(textBlocks: OcrTextBlock[]): Promise<{
    persons: OcrParsedPerson[];
    rawText: string;
    overallConfidence: number;
  }>;
}

// ── AWS Textract implementation ──────────────────────────────────

export class TextractExtractor implements OcrExtractor {
  async extractText(imageBuffer: Buffer): Promise<OcrTextBlock[]> {
    // Dynamic import to avoid requiring AWS SDK when not used
    const { TextractClient, DetectDocumentTextCommand } = await import(
      '@aws-sdk/client-textract'
    );

    const client = new TextractClient({
      region: process.env.TEXTRACT_REGION ?? process.env.AWS_REGION ?? 'us-east-1',
    });

    const command = new DetectDocumentTextCommand({
      Document: { Bytes: imageBuffer },
    });

    const response = await client.send(command);

    const blocks: OcrTextBlock[] = (response.Blocks ?? [])
      .filter((b) => b.BlockType === 'LINE' && b.Text)
      .map((b) => ({
        text: b.Text!,
        confidence: (b.Confidence ?? 0) / 100,
      }));

    return blocks;
  }
}

// ── Claude LLM parser implementation ─────────────────────────────

const HEADSTONE_PARSE_PROMPT = `You are an expert at reading headstone inscriptions. You will receive raw OCR text extracted from a headstone photo. Parse it into structured data.

IMPORTANT RULES:
- Headstones often have multiple people (husband/wife pairs). Return ALL people found.
- Common OCR errors: O↔0, I↔1, weathered/partial text, decorative fonts.
- Handle "née" or "born" for maiden names.
- Handle suffixes like Jr, Sr, II, III, IV as part of the last name.
- Dates may be partial (year only), use formats like "1923", "1923-04-15", or "Apr 15, 1923".
- If a date is ambiguous or partially readable, return what you can and mark confidence as "low".
- Leave fields as null rather than guessing when text is truly ambiguous.
- Inscriptions are epitaphs like "Beloved Father", "Rest in Peace", "Forever in our hearts".

Return ONLY valid JSON (no markdown, no explanation) in this exact format:
{
  "persons": [
    {
      "firstName": "string or null",
      "middleName": "string or null",
      "lastName": "string or null",
      "maidenName": "string or null",
      "dateOfBirth": "string (YYYY-MM-DD or YYYY) or null",
      "dateOfDeath": "string (YYYY-MM-DD or YYYY) or null",
      "inscription": "string or null",
      "confidence": {
        "firstName": "high|medium|low",
        "lastName": "high|medium|low",
        "dateOfBirth": "high|medium|low",
        "dateOfDeath": "high|medium|low",
        "inscription": "high|medium|low"
      }
    }
  ]
}

RAW OCR TEXT:
`;

export class ClaudeLlmParser implements OcrParser {
  async parseHeadstone(textBlocks: OcrTextBlock[]) {
    const rawText = textBlocks.map((b) => b.text).join('\n');
    const avgConfidence =
      textBlocks.length > 0
        ? textBlocks.reduce((sum, b) => sum + b.confidence, 0) / textBlocks.length
        : 0;

    const prompt = HEADSTONE_PARSE_PROMPT + rawText;

    let responseText: string;

    // Try AWS Bedrock first, fall back to Anthropic API
    if (process.env.BEDROCK_MODEL_ID) {
      responseText = await this.callBedrock(prompt);
    } else if (process.env.ANTHROPIC_API_KEY) {
      responseText = await this.callAnthropicApi(prompt);
    } else {
      throw new Error(
        'No LLM configured. Set BEDROCK_MODEL_ID or ANTHROPIC_API_KEY.',
      );
    }

    const parsed = JSON.parse(responseText);
    const persons: OcrParsedPerson[] = parsed.persons ?? [];

    return {
      persons,
      rawText,
      overallConfidence: avgConfidence,
    };
  }

  private async callBedrock(prompt: string): Promise<string> {
    const {
      BedrockRuntimeClient,
      InvokeModelCommand,
    } = await import('@aws-sdk/client-bedrock-runtime');

    const client = new BedrockRuntimeClient({
      region: process.env.AWS_REGION ?? 'us-east-1',
    });

    const body = JSON.stringify({
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    const command = new InvokeModelCommand({
      modelId: process.env.BEDROCK_MODEL_ID,
      body: new TextEncoder().encode(body),
      contentType: 'application/json',
      accept: 'application/json',
    });

    const response = await client.send(command);
    const result = JSON.parse(new TextDecoder().decode(response.body));
    return result.content[0].text;
  }

  private async callAnthropicApi(prompt: string): Promise<string> {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Anthropic API error: ${res.status} ${errBody}`);
    }

    const result = await res.json();
    return result.content[0].text;
  }
}

// ── Mock/Dev implementation ──────────────────────────────────────
// Returns realistic fake OCR results for local development without AWS.

export class MockOcrExtractor implements OcrExtractor {
  async extractText(_imageBuffer: Buffer): Promise<OcrTextBlock[]> {
    // Simulate Textract delay
    await new Promise((r) => setTimeout(r, 500));

    // Randomly pick one of several realistic headstone scenarios
    const scenarios = [
      // Single person
      [
        { text: 'JOHN WILLIAM SMITH', confidence: 0.95 },
        { text: '1923 — 1998', confidence: 0.88 },
        { text: 'BELOVED FATHER', confidence: 0.92 },
        { text: 'AND GRANDFATHER', confidence: 0.90 },
      ],
      // Husband and wife pair
      [
        { text: 'ROBERT L. DAVIS', confidence: 0.93 },
        { text: 'MAR 12, 1940 - JAN 5, 2015', confidence: 0.85 },
        { text: 'MARGARET A. DAVIS', confidence: 0.91 },
        { text: 'née THOMPSON', confidence: 0.78 },
        { text: 'JUN 3, 1942 - NOV 22, 2019', confidence: 0.82 },
        { text: 'TOGETHER FOREVER', confidence: 0.95 },
      ],
      // Weathered / partial text
      [
        { text: 'ELEANOR M. JONES', confidence: 0.72 },
        { text: '19O5 — 19__', confidence: 0.45 },
        { text: 'REST IN PEACE', confidence: 0.88 },
      ],
      // Name with suffix
      [
        { text: 'JAMES HENRY WILSON III', confidence: 0.94 },
        { text: 'APRIL 8, 1955', confidence: 0.91 },
        { text: 'DECEMBER 25, 2022', confidence: 0.93 },
        { text: 'A LIFE WELL LIVED', confidence: 0.89 },
      ],
    ];

    const scenario = scenarios[Math.floor(Math.random() * scenarios.length)]!;
    return scenario;
  }
}

export class MockLlmParser implements OcrParser {
  async parseHeadstone(textBlocks: OcrTextBlock[]) {
    await new Promise((r) => setTimeout(r, 300));

    const rawText = textBlocks.map((b) => b.text).join('\n');
    const avgConfidence =
      textBlocks.length > 0
        ? textBlocks.reduce((sum, b) => sum + b.confidence, 0) / textBlocks.length
        : 0;

    // Simple heuristic parsing for dev mode
    const persons = this.heuristicParse(textBlocks);

    return { persons, rawText, overallConfidence: avgConfidence };
  }

  private heuristicParse(blocks: OcrTextBlock[]): OcrParsedPerson[] {
    const persons: OcrParsedPerson[] = [];
    let currentPerson: Partial<OcrParsedPerson> | null = null;
    let inscription: string | null = null;

    for (const block of blocks) {
      const text = block.text.trim();
      const conf = block.confidence;

      // Check if this looks like a name line (all caps, has letters, no obvious dates)
      const isNameLine =
        /^[A-Z]/.test(text) &&
        !/\d{4}/.test(text) &&
        !text.toLowerCase().startsWith('née') &&
        !this.isInscription(text);

      // Check if it looks like a date line
      const isDateLine = /\d{4}/.test(text);

      // Check for maiden name
      const maidenMatch = text.match(/née\s+(\w+)/i);

      if (maidenMatch && currentPerson) {
        currentPerson.maidenName = maidenMatch[1]!;
        continue;
      }

      if (isNameLine) {
        // Save previous person if exists
        if (currentPerson?.lastName) {
          if (inscription) currentPerson.inscription = inscription;
          persons.push(this.finalizePerson(currentPerson));
          inscription = null;
        }

        const parts = text.split(/\s+/);
        currentPerson = {
          firstName: parts[0] ?? null,
          middleName: parts.length > 2 ? parts.slice(1, -1).join(' ') : null,
          lastName: parts.length > 1 ? parts[parts.length - 1]! : null,
          maidenName: null,
          confidence: {
            firstName: this.confLevel(conf),
            lastName: this.confLevel(conf),
            dateOfBirth: 'low' as const,
            dateOfDeath: 'low' as const,
            inscription: 'low' as const,
          },
        };
      } else if (isDateLine && currentPerson) {
        const dates = this.extractDates(text);
        if (dates.birth) {
          currentPerson.dateOfBirth = dates.birth;
          currentPerson.confidence = {
            ...currentPerson.confidence!,
            dateOfBirth: this.confLevel(conf),
          };
        }
        if (dates.death) {
          currentPerson.dateOfDeath = dates.death;
          currentPerson.confidence = {
            ...currentPerson.confidence!,
            dateOfDeath: this.confLevel(conf),
          };
        }
      } else if (this.isInscription(text)) {
        inscription = inscription ? `${inscription} ${text}` : text;
      }
    }

    // Push last person
    if (currentPerson?.lastName) {
      if (inscription) {
        currentPerson.inscription = inscription;
        currentPerson.confidence = {
          ...currentPerson.confidence!,
          inscription: 'medium' as const,
        };
      }
      persons.push(this.finalizePerson(currentPerson));
    }

    // If no persons found, return a single empty person
    if (persons.length === 0) {
      persons.push({
        firstName: null,
        middleName: null,
        lastName: null,
        maidenName: null,
        dateOfBirth: null,
        dateOfDeath: null,
        inscription: null,
        confidence: {
          firstName: 'low',
          lastName: 'low',
          dateOfBirth: 'low',
          dateOfDeath: 'low',
          inscription: 'low',
        },
      });
    }

    return persons;
  }

  private finalizePerson(partial: Partial<OcrParsedPerson>): OcrParsedPerson {
    return {
      firstName: partial.firstName ?? null,
      middleName: partial.middleName ?? null,
      lastName: partial.lastName ?? null,
      maidenName: partial.maidenName ?? null,
      dateOfBirth: partial.dateOfBirth ?? null,
      dateOfDeath: partial.dateOfDeath ?? null,
      inscription: partial.inscription ?? null,
      confidence: partial.confidence ?? {
        firstName: 'low',
        lastName: 'low',
        dateOfBirth: 'low',
        dateOfDeath: 'low',
        inscription: 'low',
      },
    };
  }

  private confLevel(conf: number): 'high' | 'medium' | 'low' {
    if (conf >= 0.9) return 'high';
    if (conf >= 0.7) return 'medium';
    return 'low';
  }

  private isInscription(text: string): boolean {
    const inscriptionKeywords = [
      'beloved',
      'rest in peace',
      'forever',
      'memory',
      'loving',
      'father',
      'mother',
      'husband',
      'wife',
      'grandfather',
      'grandmother',
      'life well lived',
      'in our hearts',
    ];
    const lower = text.toLowerCase();
    return inscriptionKeywords.some((kw) => lower.includes(kw));
  }

  private extractDates(text: string): {
    birth: string | null;
    death: string | null;
  } {
    // Handle "1923 — 1998" or "1923 - 1998"
    const yearRange = text.match(/(\d{4})\s*[—–-]\s*(\d{4}|19__|20__)/);
    if (yearRange) {
      const birth = yearRange[1]!;
      const death = yearRange[2]!.includes('_') ? null : yearRange[2]!;
      return { birth, death };
    }

    // Handle "MAR 12, 1940 - JAN 5, 2015"
    const fullDateRange = text.match(
      /([A-Z]{3,9})\s+(\d{1,2}),?\s+(\d{4})\s*[-–—]\s*([A-Z]{3,9})\s+(\d{1,2}),?\s+(\d{4})/i,
    );
    if (fullDateRange) {
      const birth = this.parseDate(
        fullDateRange[1]!,
        fullDateRange[2]!,
        fullDateRange[3]!,
      );
      const death = this.parseDate(
        fullDateRange[4]!,
        fullDateRange[5]!,
        fullDateRange[6]!,
      );
      return { birth, death };
    }

    // Handle single full date "APRIL 8, 1955"
    const singleDate = text.match(
      /([A-Z]{3,9})\s+(\d{1,2}),?\s+(\d{4})/i,
    );
    if (singleDate) {
      const date = this.parseDate(singleDate[1]!, singleDate[2]!, singleDate[3]!);
      // If we don't have context, assume first date is birth
      return { birth: date, death: null };
    }

    return { birth: null, death: null };
  }

  private parseDate(month: string, day: string, year: string): string {
    const months: Record<string, string> = {
      jan: '01', january: '01',
      feb: '02', february: '02',
      mar: '03', march: '03',
      apr: '04', april: '04',
      may: '05',
      jun: '06', june: '06',
      jul: '07', july: '07',
      aug: '08', august: '08',
      sep: '09', september: '09',
      oct: '10', october: '10',
      nov: '11', november: '11',
      dec: '12', december: '12',
    };
    const m = months[month.toLowerCase()] ?? '01';
    return `${year}-${m}-${day.padStart(2, '0')}`;
  }
}

// ── Vision-based OCR (replaces Textract + LLM two-step pipeline) ─

export interface VisionOcrProcessor {
  processImage(imageBuffer: Buffer): Promise<{
    persons: OcrParsedPerson[];
    rawText: string;
    overallConfidence: number;
  }>;
}

const VISION_HEADSTONE_PROMPT = `You are an expert at reading headstone inscriptions from cemetery photos.

IMPORTANT: Focus ONLY on the PRIMARY headstone — the one that is largest, closest to the camera, and most centered in the frame. IGNORE any headstones visible in the background or at the edges of the photo.

Parse the primary headstone's inscription into structured data.

RULES:
- Headstones often have multiple people (husband/wife pairs). Return ALL people on the PRIMARY stone.
- Common issues: decorative fonts, weathered/partial text, reflections, shadows, engraved images.
- Handle "née" or "born" for maiden names.
- Handle suffixes like Jr, Sr, II, III, IV as part of the last name.
- Dates may be partial (year only), use formats like "1923", "1923-04-15".
- If text is ambiguous or unreadable, return null and mark confidence as "low".
- Leave fields as null rather than guessing when text is truly ambiguous.
- Inscriptions are epitaphs like "Beloved Father", "Rest in Peace", "Forever in our hearts".

Return ONLY valid JSON (no markdown, no explanation) in this exact format:
{
  "persons": [
    {
      "firstName": "string or null",
      "middleName": "string or null",
      "lastName": "string or null",
      "maidenName": "string or null",
      "dateOfBirth": "string (YYYY-MM-DD or YYYY) or null",
      "dateOfDeath": "string (YYYY-MM-DD or YYYY) or null",
      "inscription": "string or null",
      "confidence": {
        "firstName": "high|medium|low",
        "lastName": "high|medium|low",
        "dateOfBirth": "high|medium|low",
        "dateOfDeath": "high|medium|low",
        "inscription": "high|medium|low"
      }
    }
  ],
  "rawText": "all text visible on the primary headstone, line by line"
}`;

export class ClaudeVisionProcessor implements VisionOcrProcessor {
  async processImage(imageBuffer: Buffer) {
    const base64Image = imageBuffer.toString('base64');
    const mediaType = this.detectMediaType(imageBuffer);

    let responseText: string;

    if (process.env.BEDROCK_MODEL_ID) {
      responseText = await this.callBedrock(base64Image, mediaType);
    } else if (process.env.ANTHROPIC_API_KEY) {
      responseText = await this.callAnthropicApi(base64Image, mediaType);
    } else {
      throw new Error(
        'No LLM configured. Set BEDROCK_MODEL_ID or ANTHROPIC_API_KEY.',
      );
    }

    const parsed = JSON.parse(responseText);
    const persons: OcrParsedPerson[] = parsed.persons ?? [];
    const rawText: string = parsed.rawText ?? '';

    // Derive confidence from per-field confidence levels
    const confidenceScores = persons.flatMap((p) =>
      Object.values(p.confidence).map((c) =>
        c === 'high' ? 0.95 : c === 'medium' ? 0.75 : 0.4,
      ),
    );
    const overallConfidence =
      confidenceScores.length > 0
        ? confidenceScores.reduce((a, b) => a + b, 0) / confidenceScores.length
        : 0;

    return { persons, rawText, overallConfidence };
  }

  private detectMediaType(
    buffer: Buffer,
  ): 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' {
    // Check magic bytes
    if (buffer[0] === 0xff && buffer[1] === 0xd8) return 'image/jpeg';
    if (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47
    )
      return 'image/png';
    if (buffer[0] === 0x52 && buffer[1] === 0x49) return 'image/webp';
    // Default to JPEG (most common for photos)
    return 'image/jpeg';
  }

  private buildMessages(base64Image: string, mediaType: string) {
    return [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType,
              data: base64Image,
            },
          },
          {
            type: 'text',
            text: VISION_HEADSTONE_PROMPT,
          },
        ],
      },
    ];
  }

  private async callBedrock(
    base64Image: string,
    mediaType: string,
  ): Promise<string> {
    const { BedrockRuntimeClient, InvokeModelCommand } = await import(
      '@aws-sdk/client-bedrock-runtime'
    );

    const client = new BedrockRuntimeClient({
      region: process.env.AWS_REGION ?? 'us-east-1',
    });

    const body = JSON.stringify({
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 1024,
      messages: this.buildMessages(base64Image, mediaType),
    });

    const command = new InvokeModelCommand({
      modelId: process.env.BEDROCK_MODEL_ID,
      body: new TextEncoder().encode(body),
      contentType: 'application/json',
      accept: 'application/json',
    });

    const response = await client.send(command);
    const result = JSON.parse(new TextDecoder().decode(response.body));
    return result.content[0].text;
  }

  private async callAnthropicApi(
    base64Image: string,
    mediaType: string,
  ): Promise<string> {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: this.buildMessages(base64Image, mediaType),
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Anthropic API error: ${res.status} ${errBody}`);
    }

    const result = await res.json();
    return result.content[0].text;
  }
}

// ── Mock Vision Processor (dev mode) ────────────────────────────

export class MockVisionProcessor implements VisionOcrProcessor {
  private mockExtractor = new MockOcrExtractor();
  private mockParser = new MockLlmParser();

  async processImage(imageBuffer: Buffer) {
    const textBlocks = await this.mockExtractor.extractText(imageBuffer);
    return this.mockParser.parseHeadstone(textBlocks);
  }
}

// ── Factory ──────────────────────────────────────────────────────
// Use mock in dev mode (no AWS creds), real implementations in prod.

const USE_MOCK_OCR =
  process.env.OCR_MODE === 'mock' ||
  (!process.env.AWS_ACCESS_KEY_ID &&
    !process.env.TEXTRACT_REGION &&
    !process.env.AWS_PROFILE);

export function createVisionProcessor(): VisionOcrProcessor {
  // Vision mode only needs an LLM key (Anthropic or Bedrock), not AWS Textract creds
  if (process.env.ANTHROPIC_API_KEY || process.env.BEDROCK_MODEL_ID) {
    console.log('[OCR] Using Claude Vision processor');
    return new ClaudeVisionProcessor();
  }
  if (process.env.OCR_MODE !== 'mock') {
    console.log('[OCR] No ANTHROPIC_API_KEY or BEDROCK_MODEL_ID set — falling back to mock vision processor');
  } else {
    console.log('[OCR] Using mock vision processor (dev mode)');
  }
  return new MockVisionProcessor();
}

// Legacy factories — kept for backward compatibility
export function createOcrExtractor(): OcrExtractor {
  if (USE_MOCK_OCR) {
    console.log('[OCR] Using mock OCR extractor (dev mode)');
    return new MockOcrExtractor();
  }
  console.log('[OCR] Using AWS Textract extractor');
  return new TextractExtractor();
}

export function createOcrParser(): OcrParser {
  if (
    USE_MOCK_OCR &&
    !process.env.ANTHROPIC_API_KEY &&
    !process.env.BEDROCK_MODEL_ID
  ) {
    console.log('[OCR] Using mock LLM parser (dev mode)');
    return new MockLlmParser();
  }
  console.log('[OCR] Using Claude LLM parser');
  return new ClaudeLlmParser();
}

import { describe, it, expect } from 'vitest';
import {
  searchQuerySchema,
  createPlotSchema,
  createDeceasedPersonSchema,
  createCemeterySchema,
  loginSchema,
  registerSchema,
  exifDataSchema,
  photoUploadMetadataSchema,
  manualPinDropSchema,
  csvImportRowSchema,
  ocrFieldConfidenceSchema,
  ocrParsedPersonSchema,
  ocrResultSchema,
  ocrConfirmSchema,
  publicSubmitSchema,
} from './schemas.js';

const UUID = '123e4567-e89b-12d3-a456-426614174000';

// ---------------------------------------------------------------------------
// searchQuerySchema
// ---------------------------------------------------------------------------
describe('searchQuerySchema', () => {
  it('accepts a minimal valid input and applies defaults', () => {
    const result = searchQuerySchema.parse({ q: 'Smith' });
    expect(result.q).toBe('Smith');
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
  });

  it('rejects an empty q', () => {
    expect(() => searchQuerySchema.parse({ q: '' })).toThrow();
  });

  it('rejects q longer than 200 characters', () => {
    expect(() => searchQuerySchema.parse({ q: 'a'.repeat(201) })).toThrow();
  });

  it('coerces string year values to numbers', () => {
    const result = searchQuerySchema.parse({
      q: 'Jones',
      birthYearMin: '1900',
      deathYearMax: '2000',
    });
    expect(result.birthYearMin).toBe(1900);
    expect(result.deathYearMax).toBe(2000);
  });

  it('rejects limit above 100', () => {
    expect(() => searchQuerySchema.parse({ q: 'x', limit: 101 })).toThrow();
  });

  it('rejects page less than 1', () => {
    expect(() => searchQuerySchema.parse({ q: 'x', page: 0 })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// createPlotSchema
// ---------------------------------------------------------------------------
describe('createPlotSchema', () => {
  it('accepts a minimal valid plot', () => {
    const result = createPlotSchema.parse({ cemeteryId: UUID });
    expect(result.cemeteryId).toBe(UUID);
    expect(result.status).toBe('unpinned');
  });

  it('rejects a non-UUID cemeteryId', () => {
    expect(() => createPlotSchema.parse({ cemeteryId: 'not-a-uuid' })).toThrow();
  });

  it('rejects lon out of range', () => {
    expect(() =>
      createPlotSchema.parse({ cemeteryId: UUID, lon: 181 }),
    ).toThrow();
  });

  it('rejects lat out of range', () => {
    expect(() =>
      createPlotSchema.parse({ cemeteryId: UUID, lat: -91 }),
    ).toThrow();
  });

  it('accepts all gpsSource enum values', () => {
    for (const src of ['exif', 'manual', 'csv', 'geocoded'] as const) {
      const result = createPlotSchema.parse({ cemeteryId: UUID, gpsSource: src });
      expect(result.gpsSource).toBe(src);
    }
  });

  it('rejects an invalid status', () => {
    expect(() =>
      createPlotSchema.parse({ cemeteryId: UUID, status: 'deleted' }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// createDeceasedPersonSchema
// ---------------------------------------------------------------------------
describe('createDeceasedPersonSchema', () => {
  const valid = {
    cemeteryId: UUID,
    firstName: 'Jane',
    lastName: 'Doe',
  };

  it('accepts valid input with defaults', () => {
    const result = createDeceasedPersonSchema.parse(valid);
    expect(result.isPubliclyVisible).toBe(true);
  });

  it('rejects missing firstName', () => {
    expect(() =>
      createDeceasedPersonSchema.parse({ ...valid, firstName: '' }),
    ).toThrow();
  });

  it('rejects missing lastName', () => {
    expect(() =>
      createDeceasedPersonSchema.parse({ ...valid, lastName: '' }),
    ).toThrow();
  });

  it('rejects firstName longer than 100 characters', () => {
    expect(() =>
      createDeceasedPersonSchema.parse({ ...valid, firstName: 'A'.repeat(101) }),
    ).toThrow();
  });

  it('accepts optional fields', () => {
    const result = createDeceasedPersonSchema.parse({
      ...valid,
      middleName: 'Marie',
      maidenName: 'Smith',
      dateOfBirth: '1940-01-01',
      dateOfDeath: '2020-12-31',
      inscription: 'Beloved mother',
    });
    expect(result.middleName).toBe('Marie');
    expect(result.inscription).toBe('Beloved mother');
  });
});

// ---------------------------------------------------------------------------
// createCemeterySchema
// ---------------------------------------------------------------------------
describe('createCemeterySchema', () => {
  const valid = {
    name: 'Green Meadows Cemetery',
    slug: 'green-meadows',
    address: '123 Main St',
    city: 'Springfield',
    state: 'IL',
    zip: '62701',
  };

  it('accepts a valid cemetery', () => {
    const result = createCemeterySchema.parse(valid);
    expect(result.slug).toBe('green-meadows');
  });

  it('rejects a slug with uppercase letters', () => {
    expect(() =>
      createCemeterySchema.parse({ ...valid, slug: 'Green-Meadows' }),
    ).toThrow();
  });

  it('rejects a slug with spaces', () => {
    expect(() =>
      createCemeterySchema.parse({ ...valid, slug: 'green meadows' }),
    ).toThrow();
  });

  it('accepts a slug with numbers and hyphens', () => {
    const result = createCemeterySchema.parse({ ...valid, slug: 'cemetery-123' });
    expect(result.slug).toBe('cemetery-123');
  });

  it('rejects an invalid contactEmail', () => {
    expect(() =>
      createCemeterySchema.parse({ ...valid, contactEmail: 'not-an-email' }),
    ).toThrow();
  });

  it('accepts a valid contactEmail', () => {
    const result = createCemeterySchema.parse({
      ...valid,
      contactEmail: 'admin@example.com',
    });
    expect(result.contactEmail).toBe('admin@example.com');
  });
});

// ---------------------------------------------------------------------------
// loginSchema
// ---------------------------------------------------------------------------
describe('loginSchema', () => {
  it('accepts valid credentials', () => {
    const result = loginSchema.parse({
      email: 'user@example.com',
      password: 'password123',
    });
    expect(result.email).toBe('user@example.com');
  });

  it('rejects invalid email', () => {
    expect(() =>
      loginSchema.parse({ email: 'not-email', password: 'password123' }),
    ).toThrow();
  });

  it('rejects password shorter than 8 characters', () => {
    expect(() =>
      loginSchema.parse({ email: 'user@example.com', password: 'short' }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// registerSchema
// ---------------------------------------------------------------------------
describe('registerSchema', () => {
  const valid = {
    email: 'user@example.com',
    password: 'password123',
    name: 'John Doe',
    cemeteryName: 'Oak Hill',
    cemeteryAddress: '1 Oak Ave',
    cemeteryCity: 'Springfield',
    cemeteryState: 'IL',
    cemeteryZip: '62701',
  };

  it('accepts a valid registration', () => {
    const result = registerSchema.parse(valid);
    expect(result.email).toBe('user@example.com');
  });

  it('rejects empty name', () => {
    expect(() => registerSchema.parse({ ...valid, name: '' })).toThrow();
  });

  it('rejects empty cemeteryName', () => {
    expect(() =>
      registerSchema.parse({ ...valid, cemeteryName: '' }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// exifDataSchema
// ---------------------------------------------------------------------------
describe('exifDataSchema', () => {
  it('accepts all-null EXIF data (no GPS)', () => {
    const result = exifDataSchema.parse({
      lat: null,
      lon: null,
      accuracy: null,
      capturedAt: null,
      deviceMake: null,
      deviceModel: null,
    });
    expect(result.lat).toBeNull();
  });

  it('accepts valid EXIF data with coordinates', () => {
    const result = exifDataSchema.parse({
      lat: 39.7817,
      lon: -89.6501,
      accuracy: 3.2,
      capturedAt: '2024-06-01T10:30:00Z',
      deviceMake: 'Apple',
      deviceModel: 'iPhone 15',
    });
    expect(result.lat).toBe(39.7817);
    expect(result.deviceMake).toBe('Apple');
  });

  it('rejects lat out of range', () => {
    expect(() =>
      exifDataSchema.parse({
        lat: 91,
        lon: null,
        accuracy: null,
        capturedAt: null,
        deviceMake: null,
        deviceModel: null,
      }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// photoUploadMetadataSchema
// ---------------------------------------------------------------------------
describe('photoUploadMetadataSchema', () => {
  it('accepts valid metadata', () => {
    const result = photoUploadMetadataSchema.parse({
      cemeteryId: UUID,
      plotId: UUID,
      exifLat: 39.78,
      exifLon: -89.65,
      exifAccuracy: 4.1,
      capturedAt: '2024-01-01T00:00:00Z',
    });
    expect(result.plotId).toBe(UUID);
  });

  it('accepts null GPS fields', () => {
    const result = photoUploadMetadataSchema.parse({
      cemeteryId: UUID,
      plotId: UUID,
      exifLat: null,
      exifLon: null,
      exifAccuracy: null,
      capturedAt: null,
    });
    expect(result.exifLat).toBeNull();
  });

  it('rejects a non-UUID plotId', () => {
    expect(() =>
      photoUploadMetadataSchema.parse({
        cemeteryId: UUID,
        plotId: 'bad',
        exifLat: null,
        exifLon: null,
        exifAccuracy: null,
        capturedAt: null,
      }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// manualPinDropSchema
// ---------------------------------------------------------------------------
describe('manualPinDropSchema', () => {
  const valid = {
    cemeteryId: UUID,
    lon: -89.6501,
    lat: 39.7817,
    gpsAccuracyMeters: 2.5,
    firstName: 'Jane',
    lastName: 'Doe',
  };

  it('accepts a valid pin drop', () => {
    const result = manualPinDropSchema.parse(valid);
    expect(result.firstName).toBe('Jane');
  });

  it('rejects missing lon', () => {
    const { lon: _lon, ...rest } = valid;
    expect(() => manualPinDropSchema.parse(rest)).toThrow();
  });

  it('rejects negative gpsAccuracyMeters', () => {
    expect(() =>
      manualPinDropSchema.parse({ ...valid, gpsAccuracyMeters: -1 }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// csvImportRowSchema
// ---------------------------------------------------------------------------
describe('csvImportRowSchema', () => {
  it('accepts a valid row', () => {
    const result = csvImportRowSchema.parse({
      firstName: 'Alice',
      lastName: 'Smith',
    });
    expect(result.firstName).toBe('Alice');
  });

  it('rejects empty firstName with a meaningful message', () => {
    const result = csvImportRowSchema.safeParse({
      firstName: '',
      lastName: 'Smith',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages).toContain('First name is required');
    }
  });

  it('rejects empty lastName with a meaningful message', () => {
    const result = csvImportRowSchema.safeParse({
      firstName: 'Alice',
      lastName: '',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages).toContain('Last name is required');
    }
  });
});

// ---------------------------------------------------------------------------
// ocrFieldConfidenceSchema
// ---------------------------------------------------------------------------
describe('ocrFieldConfidenceSchema', () => {
  it.each(['high', 'medium', 'low'] as const)('accepts "%s"', (val) => {
    expect(ocrFieldConfidenceSchema.parse(val)).toBe(val);
  });

  it('rejects an unknown confidence value', () => {
    expect(() => ocrFieldConfidenceSchema.parse('very-high')).toThrow();
  });
});

// ---------------------------------------------------------------------------
// ocrParsedPersonSchema
// ---------------------------------------------------------------------------
describe('ocrParsedPersonSchema', () => {
  const valid = {
    firstName: 'John',
    middleName: null,
    lastName: 'Doe',
    maidenName: null,
    dateOfBirth: '1940-01-01',
    dateOfDeath: '2020-12-31',
    inscription: 'Rest in peace',
    confidence: {
      firstName: 'high',
      lastName: 'high',
      dateOfBirth: 'medium',
      dateOfDeath: 'medium',
      inscription: 'low',
    },
  };

  it('accepts a complete valid parsed person', () => {
    const result = ocrParsedPersonSchema.parse(valid);
    expect(result.firstName).toBe('John');
    expect(result.confidence.firstName).toBe('high');
  });

  it('accepts null values for name fields', () => {
    const result = ocrParsedPersonSchema.parse({ ...valid, firstName: null, lastName: null });
    expect(result.firstName).toBeNull();
  });

  it('rejects an invalid confidence level', () => {
    expect(() =>
      ocrParsedPersonSchema.parse({
        ...valid,
        confidence: { ...valid.confidence, firstName: 'very-high' },
      }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// ocrResultSchema
// ---------------------------------------------------------------------------
describe('ocrResultSchema', () => {
  const validPerson = {
    firstName: 'Jane',
    middleName: null,
    lastName: 'Doe',
    maidenName: null,
    dateOfBirth: null,
    dateOfDeath: null,
    inscription: null,
    confidence: {
      firstName: 'high',
      lastName: 'high',
      dateOfBirth: 'low',
      dateOfDeath: 'low',
      inscription: 'low',
    },
  };

  it('accepts a valid OCR result', () => {
    const result = ocrResultSchema.parse({
      rawText: 'JANE DOE',
      persons: [validPerson],
      overallConfidence: 0.85,
      photoId: UUID,
    });
    expect(result.persons).toHaveLength(1);
    expect(result.overallConfidence).toBe(0.85);
  });

  it('rejects overallConfidence above 1', () => {
    expect(() =>
      ocrResultSchema.parse({
        rawText: '',
        persons: [],
        overallConfidence: 1.1,
        photoId: UUID,
      }),
    ).toThrow();
  });

  it('rejects overallConfidence below 0', () => {
    expect(() =>
      ocrResultSchema.parse({
        rawText: '',
        persons: [],
        overallConfidence: -0.1,
        photoId: UUID,
      }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// ocrConfirmSchema
// ---------------------------------------------------------------------------
describe('ocrConfirmSchema', () => {
  const validPerson = {
    firstName: 'Alice',
    lastName: 'Smith',
  };

  it('accepts a minimal valid confirmation', () => {
    const result = ocrConfirmSchema.parse({
      cemeteryId: UUID,
      photoId: UUID,
      persons: [validPerson],
    });
    expect(result.persons).toHaveLength(1);
  });

  it('rejects a non-UUID photoId', () => {
    expect(() =>
      ocrConfirmSchema.parse({
        cemeteryId: UUID,
        photoId: 'not-uuid',
        persons: [validPerson],
      }),
    ).toThrow();
  });

  it('rejects a person with empty firstName', () => {
    expect(() =>
      ocrConfirmSchema.parse({
        cemeteryId: UUID,
        photoId: UUID,
        persons: [{ firstName: '', lastName: 'Smith' }],
      }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// publicSubmitSchema
// ---------------------------------------------------------------------------
describe('publicSubmitSchema', () => {
  const validPerson = {
    firstName: 'Bob',
    lastName: 'Jones',
  };

  const valid = {
    photoId: UUID,
    lat: 39.78,
    lon: -89.65,
    persons: [validPerson],
  };

  it('accepts a minimal valid submission', () => {
    const result = publicSubmitSchema.parse(valid);
    expect(result.persons).toHaveLength(1);
  });

  it('rejects an empty persons array', () => {
    expect(() =>
      publicSubmitSchema.parse({ ...valid, persons: [] }),
    ).toThrow();
  });

  it('rejects lat out of range', () => {
    expect(() =>
      publicSubmitSchema.parse({ ...valid, lat: 91 }),
    ).toThrow();
  });

  it('rejects lon out of range', () => {
    expect(() =>
      publicSubmitSchema.parse({ ...valid, lon: -181 }),
    ).toThrow();
  });

  it('accepts an optional cemeteryId', () => {
    const result = publicSubmitSchema.parse({
      ...valid,
      cemeteryId: UUID,
      submittedBy: 'visitor@example.com',
    });
    expect(result.cemeteryId).toBe(UUID);
    expect(result.submittedBy).toBe('visitor@example.com');
  });
});

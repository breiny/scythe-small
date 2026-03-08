import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  MockLlmParser,
  ClaudeLlmParser,
  ClaudeVisionProcessor,
  MockVisionProcessor,
  createVisionProcessor,
  createOcrExtractor,
  createOcrParser,
  TextractExtractor,
  MockOcrExtractor,
  type OcrTextBlock,
} from './ocrService.js';

// ---------------------------------------------------------------------------
// MockLlmParser
// ---------------------------------------------------------------------------
describe('MockLlmParser', () => {
  let parser: MockLlmParser;

  beforeEach(() => {
    parser = new MockLlmParser();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function parse(blocks: OcrTextBlock[]) {
    const promise = parser.parseHeadstone(blocks);
    await vi.runAllTimersAsync();
    return promise;
  }

  it('returns a fallback empty person for empty input', async () => {
    const result = await parse([]);
    expect(result.persons).toHaveLength(1);
    expect(result.persons[0]!.firstName).toBeNull();
    expect(result.persons[0]!.lastName).toBeNull();
    expect(result.overallConfidence).toBe(0);
    expect(result.rawText).toBe('');
  });

  it('parses a single person from name line + year range', async () => {
    const result = await parse([
      { text: 'JOHN WILLIAM SMITH', confidence: 0.95 },
      { text: '1923 — 1998', confidence: 0.88 },
      { text: 'BELOVED FATHER', confidence: 0.92 },
    ]);
    expect(result.persons).toHaveLength(1);
    const person = result.persons[0]!;
    expect(person.firstName).toBe('JOHN');
    expect(person.middleName).toBe('WILLIAM');
    expect(person.lastName).toBe('SMITH');
    expect(person.dateOfBirth).toBe('1923');
    expect(person.dateOfDeath).toBe('1998');
    expect(person.inscription).toContain('BELOVED');
  });

  it('parses two people from a husband/wife headstone', async () => {
    const result = await parse([
      { text: 'ROBERT L. DAVIS', confidence: 0.93 },
      { text: 'MAR 12, 1940 - JAN 5, 2015', confidence: 0.85 },
      { text: 'MARGARET A. DAVIS', confidence: 0.91 },
      { text: 'JUN 3, 1942 - NOV 22, 2019', confidence: 0.82 },
    ]);
    expect(result.persons).toHaveLength(2);
    expect(result.persons[0]!.firstName).toBe('ROBERT');
    expect(result.persons[1]!.firstName).toBe('MARGARET');
  });

  it('detects maiden name via "née"', async () => {
    const result = await parse([
      { text: 'MARGARET A. DAVIS', confidence: 0.91 },
      { text: 'née THOMPSON', confidence: 0.78 },
      { text: '1940 — 2019', confidence: 0.82 },
    ]);
    expect(result.persons).toHaveLength(1);
    expect(result.persons[0]!.maidenName).toBe('THOMPSON');
  });

  it('assigns high confidence for blocks >= 0.9', async () => {
    const result = await parse([{ text: 'ALICE BROWN', confidence: 0.95 }]);
    expect(result.persons[0]!.confidence.firstName).toBe('high');
  });

  it('assigns medium confidence for blocks between 0.7 and 0.9', async () => {
    const result = await parse([{ text: 'ALICE BROWN', confidence: 0.75 }]);
    expect(result.persons[0]!.confidence.firstName).toBe('medium');
  });

  it('assigns low confidence for blocks below 0.7', async () => {
    const result = await parse([{ text: 'ALICE BROWN', confidence: 0.5 }]);
    expect(result.persons[0]!.confidence.firstName).toBe('low');
  });

  it('joins rawText as newline-separated block texts', async () => {
    const result = await parse([
      { text: 'ALICE BROWN', confidence: 0.95 },
      { text: '1950 — 2020', confidence: 0.90 },
    ]);
    expect(result.rawText).toBe('ALICE BROWN\n1950 — 2020');
  });

  it('calculates overallConfidence as the average of block confidences', async () => {
    const result = await parse([
      { text: 'ALICE BROWN', confidence: 0.8 },
      { text: '1950 — 2020', confidence: 0.6 },
    ]);
    expect(result.overallConfidence).toBeCloseTo(0.7);
  });

  it('returns null for death year when the year is partial (contains __)', async () => {
    const result = await parse([
      { text: 'ELEANOR JONES', confidence: 0.72 },
      { text: '1905 — 19__', confidence: 0.45 },
    ]);
    expect(result.persons[0]!.dateOfBirth).toBe('1905');
    expect(result.persons[0]!.dateOfDeath).toBeNull();
  });

  it('parses full named-month date ranges (MAR 12, 1940 - JAN 5, 2015)', async () => {
    const result = await parse([
      { text: 'ROBERT DAVIS', confidence: 0.93 },
      { text: 'MAR 12, 1940 - JAN 5, 2015', confidence: 0.85 },
    ]);
    expect(result.persons[0]!.dateOfBirth).toBe('1940-03-12');
    expect(result.persons[0]!.dateOfDeath).toBe('2015-01-05');
  });

  it('parses a single named-month date as birth date', async () => {
    const result = await parse([
      { text: 'JAMES WILSON', confidence: 0.94 },
      { text: 'APRIL 8, 1955', confidence: 0.91 },
    ]);
    expect(result.persons[0]!.dateOfBirth).toBe('1955-04-08');
    expect(result.persons[0]!.dateOfDeath).toBeNull();
  });

  it('accumulates inscription text across multiple inscription lines', async () => {
    const result = await parse([
      { text: 'JOHN SMITH', confidence: 0.95 },
      { text: '1900 — 1980', confidence: 0.9 },
      { text: 'BELOVED FATHER', confidence: 0.92 },
      { text: 'AND GRANDFATHER', confidence: 0.90 },
    ]);
    const insc = result.persons[0]!.inscription ?? '';
    expect(insc).toContain('BELOVED');
    expect(insc).toContain('GRANDFATHER');
  });
});

// ---------------------------------------------------------------------------
// ClaudeLlmParser
// ---------------------------------------------------------------------------
describe('ClaudeLlmParser', () => {
  let parser: ClaudeLlmParser;

  beforeEach(() => {
    parser = new ClaudeLlmParser();
    vi.stubGlobal('fetch', vi.fn());
    delete process.env['ANTHROPIC_API_KEY'];
    delete process.env['BEDROCK_MODEL_ID'];
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env['ANTHROPIC_API_KEY'];
    delete process.env['BEDROCK_MODEL_ID'];
  });

  it('throws when neither ANTHROPIC_API_KEY nor BEDROCK_MODEL_ID is set', async () => {
    await expect(
      parser.parseHeadstone([{ text: 'JOHN SMITH', confidence: 0.9 }]),
    ).rejects.toThrow(/No LLM configured/);
  });

  it('calls the Anthropic API when ANTHROPIC_API_KEY is set', async () => {
    process.env['ANTHROPIC_API_KEY'] = 'test-key';
    const mockPerson = {
      firstName: 'John',
      middleName: null,
      lastName: 'Smith',
      maidenName: null,
      dateOfBirth: '1923',
      dateOfDeath: '1998',
      inscription: null,
      confidence: {
        firstName: 'high',
        lastName: 'high',
        dateOfBirth: 'medium',
        dateOfDeath: 'medium',
        inscription: 'low',
      },
    };

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [{ text: JSON.stringify({ persons: [mockPerson] }) }],
      }),
    } as Response);

    const result = await parser.parseHeadstone([
      { text: 'JOHN SMITH', confidence: 0.9 },
      { text: '1923 - 1998', confidence: 0.85 },
    ]);

    expect(fetch).toHaveBeenCalledOnce();
    expect(result.persons).toHaveLength(1);
    expect(result.persons[0]!.firstName).toBe('John');
    expect(result.rawText).toBe('JOHN SMITH\n1923 - 1998');
  });

  it('strips markdown code fences from the LLM response', async () => {
    process.env['ANTHROPIC_API_KEY'] = 'test-key';

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [{ text: '```json\n{"persons":[]}\n```' }],
      }),
    } as Response);

    const result = await parser.parseHeadstone([]);
    expect(result.persons).toEqual([]);
  });

  it('throws when the Anthropic API returns a non-ok status', async () => {
    process.env['ANTHROPIC_API_KEY'] = 'test-key';

    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    } as unknown as Response);

    await expect(
      parser.parseHeadstone([{ text: 'JOHN SMITH', confidence: 0.9 }]),
    ).rejects.toThrow(/Anthropic API error: 401/);
  });

  it('computes overallConfidence as mean of block confidences', async () => {
    process.env['ANTHROPIC_API_KEY'] = 'test-key';

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ content: [{ text: '{"persons":[]}' }] }),
    } as Response);

    const result = await parser.parseHeadstone([
      { text: 'A', confidence: 0.8 },
      { text: 'B', confidence: 0.6 },
    ]);
    expect(result.overallConfidence).toBeCloseTo(0.7);
  });
});

// ---------------------------------------------------------------------------
// Factory functions
// ---------------------------------------------------------------------------
describe('createVisionProcessor', () => {
  afterEach(() => {
    delete process.env['ANTHROPIC_API_KEY'];
    delete process.env['BEDROCK_MODEL_ID'];
    delete process.env['OCR_MODE'];
  });

  it('returns ClaudeVisionProcessor when ANTHROPIC_API_KEY is set', () => {
    process.env['ANTHROPIC_API_KEY'] = 'test-key';
    expect(createVisionProcessor()).toBeInstanceOf(ClaudeVisionProcessor);
  });

  it('returns ClaudeVisionProcessor when BEDROCK_MODEL_ID is set', () => {
    delete process.env['ANTHROPIC_API_KEY'];
    process.env['BEDROCK_MODEL_ID'] = 'anthropic.claude-3-haiku';
    expect(createVisionProcessor()).toBeInstanceOf(ClaudeVisionProcessor);
  });

  it('returns MockVisionProcessor when no LLM key is set', () => {
    delete process.env['ANTHROPIC_API_KEY'];
    delete process.env['BEDROCK_MODEL_ID'];
    expect(createVisionProcessor()).toBeInstanceOf(MockVisionProcessor);
  });
});

describe('createOcrExtractor', () => {
  afterEach(() => {
    delete process.env['AWS_ACCESS_KEY_ID'];
    delete process.env['TEXTRACT_REGION'];
    delete process.env['AWS_PROFILE'];
    delete process.env['OCR_MODE'];
  });

  it('returns MockOcrExtractor when OCR_MODE=mock', () => {
    process.env['OCR_MODE'] = 'mock';
    delete process.env['AWS_ACCESS_KEY_ID'];
    delete process.env['TEXTRACT_REGION'];
    delete process.env['AWS_PROFILE'];
    expect(createOcrExtractor()).toBeInstanceOf(MockOcrExtractor);
  });

  // USE_MOCK_OCR is evaluated at module load time so it cannot be changed per-test.
  // The TextractExtractor path is covered by the class being exported and importable.
});

describe('createOcrParser', () => {
  afterEach(() => {
    delete process.env['ANTHROPIC_API_KEY'];
    delete process.env['BEDROCK_MODEL_ID'];
    delete process.env['OCR_MODE'];
    delete process.env['AWS_ACCESS_KEY_ID'];
    delete process.env['TEXTRACT_REGION'];
    delete process.env['AWS_PROFILE'];
  });

  it('returns MockLlmParser when no LLM keys and mock mode', () => {
    process.env['OCR_MODE'] = 'mock';
    delete process.env['ANTHROPIC_API_KEY'];
    delete process.env['BEDROCK_MODEL_ID'];
    expect(createOcrParser()).toBeInstanceOf(MockLlmParser);
  });

  it('returns ClaudeLlmParser when ANTHROPIC_API_KEY is present', () => {
    process.env['ANTHROPIC_API_KEY'] = 'test-key';
    expect(createOcrParser()).toBeInstanceOf(ClaudeLlmParser);
  });
});

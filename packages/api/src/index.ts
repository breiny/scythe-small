import './env.js';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { errorHandler } from './middleware/errorHandler';
import { healthRouter } from './routes/health';
import { cemeteriesRouter } from './routes/cemeteries';
import { searchRouter } from './routes/search';
import { photosRouter } from './routes/photos';
import { plotsRouter } from './routes/plots';
import { authRouter } from './routes/auth';
import { pinDropRouter } from './routes/pinDrop';
import { csvImportRouter } from './routes/csvImport';
import { ocrRouter } from './routes/ocr';
import { contributeRouter } from './routes/contribute';
import { submissionsRouter } from './routes/submissions';

const app = express();
const PORT = parseInt(process.env.PORT ?? '3001', 10);

app.use(cors({ origin: process.env.FRONTEND_URL ?? 'http://localhost:5173' }));
app.use(express.json({ limit: '10mb' }));

// Serve uploaded photos
app.use('/uploads', express.static(path.resolve(process.cwd(), 'uploads')));

// Routes
app.use(healthRouter);
app.use(cemeteriesRouter);
app.use(searchRouter);
app.use(photosRouter);
app.use(plotsRouter);
app.use(authRouter);
app.use(pinDropRouter);
app.use(csvImportRouter);
app.use(ocrRouter);
app.use(contributeRouter);
app.use(submissionsRouter);

// Error handler (must be last)
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Scythe API running on http://localhost:${PORT}`);
});

export { app };

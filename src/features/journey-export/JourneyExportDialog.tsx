import { useState } from 'react';
import type { Entry, Journey } from '../../types/domain';
import { generateJourneyPdf } from './pdf/generateJourneyPdf';
import type { JourneyExportMode } from './types';
import './JourneyExportDialog.css';

export function JourneyExportDialog({
  journey,
  entries,
  onClose,
}: {
  journey: Journey;
  entries: Entry[];
  onClose: () => void;
}) {
  const [mode, setMode] = useState<JourneyExportMode>('summary');
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async () => {
    setIsExporting(true);
    setError(null);
    try {
      await generateJourneyPdf(journey, entries, mode);
      onClose();
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : 'PDF export failed.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="journey-modal" role="dialog" aria-modal="true" aria-labelledby="journey-export-title">
      <button className="journey-modal__backdrop" type="button" onClick={onClose} aria-label="Close export dialog" />
      <div className="journey-modal__panel">
        <div className="journey-modal__header">
          <div>
            <p className="eyebrow">JOURNEY PDF</p>
            <h2 id="journey-export-title">Take the journey with you.</h2>
          </div>
          <button className="journey-modal__close" type="button" onClick={onClose} disabled={isExporting} aria-label="Close">×</button>
        </div>

        <div className="journey-modal__body">
          <div className="journey-export-options" role="radiogroup" aria-label="PDF export format">
            <label className={`journey-export-option${mode === 'summary' ? ' journey-export-option--selected' : ''}`}>
              <input type="radio" name="journey-export-mode" value="summary" checked={mode === 'summary'} onChange={() => setMode('summary')} />
              <span className="journey-export-option__indicator" aria-hidden="true" />
              <span className="journey-export-option__content">
                <strong>Summary</strong>
                <span>A compact, print-friendly collection of each memory: photograph, title, date, location, people and story.</span>
              </span>
            </label>
            <label className={`journey-export-option${mode === 'comprehensive' ? ' journey-export-option--selected' : ''}`}>
              <input type="radio" name="journey-export-mode" value="comprehensive" checked={mode === 'comprehensive'} onChange={() => setMode('comprehensive')} />
              <span className="journey-export-option__indicator" aria-hidden="true" />
              <span className="journey-export-option__content">
                <strong>Comprehensive</strong>
                <span>Includes additional populated memory details, costs, tags, highlights, photo captions and the Google Photos album link.</span>
              </span>
            </label>
          </div>
          {error && <p className="journey-modal__error" role="alert">{error}</p>}
          <div className="journey-modal__actions">
            <button className="secondary-button" type="button" onClick={onClose} disabled={isExporting}>Cancel</button>
            <button className="primary-button" type="button" onClick={() => void handleExport()} disabled={isExporting}>
              {isExporting ? 'Preparing PDF…' : 'Export PDF'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

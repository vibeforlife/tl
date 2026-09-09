import { useState, type FormEvent } from 'react';
import type { User } from 'firebase/auth';
import { createJourney, validateJourneyInput, type CreateJourneyInput } from '../../services/firebase/journeys';

export function CreateJourneyForm({ user, onCreated }: { user: User; onCreated: () => Promise<void> | void }) {
  const [form, setForm] = useState<CreateJourneyInput>({ name: '', place: '', startDate: '', endDate: '' });
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const update = (field: keyof CreateJourneyInput, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setError(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;

    const validationError = validateJourneyInput(form);
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await createJourney(user, form);
      setForm({ name: '', place: '', startDate: '', endDate: '' });
      await onCreated();
    } catch (journeyError) {
      setError(journeyError instanceof Error ? journeyError.message : 'We could not create that journey. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="journey-form" onSubmit={handleSubmit} noValidate>
      <div className="journey-form__heading">
        <p className="eyebrow">NEW JOURNEY</p>
        <h2 id="new-journey-title">Create a journey.</h2>
        <p className="journey-form__copy">
          Start a new adventure and document the places, moments, and memories along the way.
        </p>
      </div>

      <div className="journey-form__fields">
        <div className="journey-form__field">
          <label htmlFor="journey-name">Journey name</label>
          <input
            id="journey-name"
            value={form.name}
            onChange={(e) => update('name', e.target.value)}
            required
            disabled={isSubmitting}
            placeholder="e.g. Italy 2026"
          />
        </div>

        <div className="journey-form__field">
          <label htmlFor="journey-place">Place</label>
          <input
            id="journey-place"
            value={form.place}
            onChange={(e) => update('place', e.target.value)}
            required
            disabled={isSubmitting}
            placeholder="e.g. Italy"
          />
        </div>

        <div className="date-grid">
          <div>
            <label htmlFor="journey-start">Start date</label>
            <input
              id="journey-start"
              type="date"
              value={form.startDate}
              onChange={(e) => update('startDate', e.target.value)}
              required
              disabled={isSubmitting}
            />
          </div>

          <div>
            <label htmlFor="journey-end">End date</label>
            <input
              id="journey-end"
              type="date"
              value={form.endDate}
              onChange={(e) => update('endDate', e.target.value)}
              min={form.startDate || undefined}
              required
              disabled={isSubmitting}
            />
          </div>
        </div>

        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}

        <button
          className="primary-button journey-form__submit"
          type="submit"
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Creating journey…' : 'Create Journey'}
        </button>
      </div>
    </form>

  );
}

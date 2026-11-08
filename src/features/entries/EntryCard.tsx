import type { Entry } from '../../types/domain';

type Props = {
  entry: Entry;
  canEdit?: boolean;
  onEdit?: (entry: Entry) => void;
  onDelete?: (entry: Entry) => void;
};

const memoryTypeLabels: Record<NonNullable<Entry['memoryType']>, string> = {
  place: 'Place', food: 'Food', sight: 'Sight', event: 'Event',
  moment: 'Moment', experience: 'Experience', people: 'People', other: 'Other',
};

const formatDate = (value: string) => {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
};

const formatTime = (value?: string) => {
  if (!value) return '';
  const [hours, minutes] = value.split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return value;
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(2000, 0, 1, hours, minutes));
};

const formatCostTotal = (entry: Entry) => {
  const totals = new Map<string, number>();
  entry.costs.forEach((cost) => totals.set(cost.currency, (totals.get(cost.currency) ?? 0) + cost.amount));
  return [...totals.entries()].map(([currency, amount]) => `${currency} ${amount.toFixed(2)}`).join(' · ');
};

const getStoryPreview = (story: string) => story.length <= 280 ? story : `${story.slice(0, 280).trimEnd()}…`;

export function EntryCard({ entry, canEdit = false, onEdit, onDelete }: Props) {
  return (
    <article className="entry-card" data-entry-id={entry.id}>
      <div className="entry-card__topline">
        <div className="entry-card__date"><span>{formatDate(entry.date)}</span>{entry.time && <span>· {formatTime(entry.time)}</span>}</div>
        <div className="entry-card__badges">
          {entry.memoryType && <span className="entry-card__type">{memoryTypeLabels[entry.memoryType]}</span>}
          {entry.rating && <span className="entry-card__rating" aria-label={`${entry.rating} out of 5 stars`}>{'★'.repeat(entry.rating)}{'☆'.repeat(5 - entry.rating)}</span>}
        </div>
      </div>
      <div className="entry-card__title-row">
        <h3>{entry.title}</h3>
        {canEdit && <span className="entry-actions">
          <button className="entry-action-button" type="button" onClick={() => onEdit?.(entry)} aria-label={`Edit ${entry.title}`}>Edit</button>
          <button className="entry-action-button entry-action-button--danger" type="button" onClick={() => onDelete?.(entry)} aria-label={`Delete ${entry.title}`}>Delete</button>
        </span>}
      </div>
      {entry.location && <div className="entry-card__location"><span className="entry-card__location-mark" aria-hidden="true">◎</span><div><strong>{entry.location.name}</strong>{entry.location.address && <span>{entry.location.address}</span>}</div></div>}
      {entry.story.length > 280 ? <details className="entry-card__story-details"><summary><span className="entry-card__story-preview">{getStoryPreview(entry.story)}</span>{' '}<span className="entry-card__story-read-full">Read full story</span><span className="entry-card__story-read-less">Read less</span></summary><p className="entry-card__story">{entry.story}</p></details> : <p className="entry-card__story">{entry.story}</p>}
      {entry.highlight && <blockquote className="entry-card__highlight"><span className="entry-card__highlight-label">THE MOMENT</span><p>“{entry.highlight}”</p></blockquote>}
      {(entry.people.length > 0 || entry.costs.length > 0) && <div className="entry-card__details">
        {entry.people.length > 0 && <div><span className="entry-card__detail-label">WITH</span><span>{entry.people.join(', ')}</span></div>}
        {entry.costs.length > 0 && <div><span className="entry-card__detail-label">SPENT</span><span className="entry-card__cost">{formatCostTotal(entry)}</span></div>}
      </div>}
      {entry.tags.length > 0 && <div className="entry-tags">{entry.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div>}
      {entry.photo && <div className="entry-card__photos"><a className="entry-card__photo" href={entry.photo.url} target="_blank" rel="noreferrer" aria-label={entry.photo.caption || 'Open anchor photo'}><img src={entry.photo.url} alt={entry.photo.caption || ''} loading="lazy" /><span>{entry.photo.caption || 'Anchor photo'}</span></a></div>}
    </article>
  );
}

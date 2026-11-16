import { DEFAULT_RELIVE_SOUNDTRACK_ID } from '../../domain/relive';

export { DEFAULT_RELIVE_SOUNDTRACK_ID };

export interface ReliveSoundtrack {
  id: string;
  title: string;
  mood: string;
  creator: string;
  src: string;
}

export const RELIVE_SOUNDTRACKS: ReliveSoundtrack[] = [
  {
    id: 'cinematic-piano',
    title: 'Uplifting Cinematic Piano',
    mood: 'Reflective · Cinematic',
    creator: 'Nickogloire',
    src: `${import.meta.env.BASE_URL}relive-music/nickogloire-cinematic-piano.mp3`,
  },
  {
    id: 'upbeat-music',
    title: 'Upbeat Music',
    mood: 'Bright · Energetic',
    creator: 'ikoliks_aj',
    src: `${import.meta.env.BASE_URL}relive-music/ikoliks-aj-upbeat.mp3`,
  },
  {
    id: 'happy-upbeat',
    title: 'Happy Upbeat Music',
    mood: 'Cheerful · Playful',
    creator: 'JonasBlakewood',
    src: `${import.meta.env.BASE_URL}relive-music/jonasblakewood-happy-upbeat.mp3`,
  },
  {
    id: 'catchy-indie-pop',
    title: 'Catchy Uplifting Indie Pop',
    mood: 'Feel-good · Indie Pop',
    creator: 'MagpieMusic',
    src: `${import.meta.env.BASE_URL}relive-music/magpiemusic-indie-pop.mp3`,
  },
  {
    id: 'upbeat-corporate',
    title: 'Upbeat Corporate',
    mood: 'Polished · Upbeat',
    creator: 'AtlasAudio',
    src: `${import.meta.env.BASE_URL}relive-music/atlasaudio-upbeat-corporate.mp3`,
  },
  {
    id: 'uplifting-80s',
    title: 'Uplifting 80s',
    mood: 'Nostalgic · Synthwave',
    creator: 'PaulYudin',
    src: `${import.meta.env.BASE_URL}relive-music/paulyudin-uplifting-80s.mp3`,
  },
];

export const getReliveSoundtrack = (soundtrackId?: string) =>
  RELIVE_SOUNDTRACKS.find((track) => track.id === soundtrackId) ??
  RELIVE_SOUNDTRACKS.find((track) => track.id === DEFAULT_RELIVE_SOUNDTRACK_ID)!;

import { useEffect, useState } from 'preact/hooks';

/** True on tablets, foldables in landscape and desktop previews, where two columns fit. */
export function useWide(query = '(min-width: 900px)') {
  const [wide, setWide] = useState(() => typeof matchMedia === 'function' && matchMedia(query).matches);
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const media = matchMedia(query);
    const update = () => setWide(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [query]);
  return wide;
}

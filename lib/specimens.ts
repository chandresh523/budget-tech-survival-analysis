/**
 * Reference images for the ten device categories.
 *
 * The source photos live outside the app (../photos, 30 files) and could not be
 * served from there; ten of them had no file extension at all, and several had
 * emoji, hashtags, Cyrillic or German in the filename, which are hostile as
 * URLs. The eight used here are copied into public/photos under clean
 * category-keyed names. Nothing in the source folder was moved or deleted.
 *
 * TWO CATEGORIES ARE DELIBERATELY NULL. There is no photograph in the set that
 * depicts a USB drive or a USB hub, and substituting a lookalike would be
 * captioning an image as evidence of something it does not show. A marked blank
 * is the honest state, and the grid renders it as a framed plate reading "no
 * reference image" — a deliberate gap in a blueprint rather than a hole.
 *
 * These are illustrative only. They are stock product photography, not
 * photographs of the devices any respondent actually owned, and no statistic is
 * derived from them. The captions say what is in the frame and nothing more.
 */

export interface Specimen {
  /** Category key — must match `deviceKeysOf` so a plate can be paired with its
   *  own live figures. */
  id: string;
  /** Printed label, or null where there is no image to label. */
  label: string | null;
  /** Public path, or null when no photo in the set depicts this category. */
  src: string | null;
  /** What is actually in the frame. Descriptive, never inferential. */
  caption: string;
  /** Source pixel dimensions, so the grid can cap magnification. */
  width: number | null;
  height: number | null;
  /**
   * True when the source is too small to be enlarged without showing it. The
   * grid must not hand these a close-to-camera slot.
   */
  lowResolution: boolean;
}

/** Longest edge below this is treated as un-enlargeable. */
export const SMALL_SOURCE_PX = 500;

const specimen = (
  id: string,
  label: string | null,
  file: string | null,
  caption: string,
  width: number | null,
  height: number | null,
): Specimen => ({
  id,
  label,
  src: file ? `/photos/${file}` : null,
  caption,
  width,
  height,
  lowResolution: width !== null && height !== null
    ? Math.max(width, height) < SMALL_SOURCE_PX
    : false,
});

export const SPECIMENS: Specimen[] = [
  specimen('tws', 'True wireless earbuds', 'tws.jpg',
    'Wireless earbuds and charging case, dark studio shot.', 736, 981),

  specimen('headphones', 'Over-ear headphones', 'headphones.jpg',
    'Over-ear headphone cup and headband, monochrome.', 736, 1308),

  specimen('cables', 'Charging cables', 'cables.jpg',
    'Multi-head charging cable, coiled.', 736, 1104),

  specimen('powerbank', 'Power bank', 'powerbank.jpg',
    'Power bank with a digital charge display.', 735, 985),

  specimen('smartwatch', 'Smartwatch', 'smartwatch.jpg',
    'Smartwatch with a digital face, lit against black.', 676, 1200),

  // Honest about what this frame is: the keyboard is the subject of the crop but
  // not of the photograph.
  specimen('keyboard', 'Keyboard', 'keyboard.jpg',
    'Mechanical keyboard within a dark desk flat-lay.', 736, 1104),

  specimen('wmouse', 'Wireless mouse', 'wmouse.jpg',
    'Computer mouse, three-quarter studio shot.', 736, 982),

  // The smallest source in the set by a wide margin.
  specimen('gwmouse', 'Gaming mouse', 'gwmouse.jpg',
    'Gaming mouse, side profile.', 404, 316),

  specimen('usbdrive', null, null,
    'No photograph in the reference set depicts a USB drive.', null, null),

  specimen('hub', null, null,
    'No photograph in the reference set depicts a USB hub.', null, null),
];

/** Lookup by category key. */
export const SPECIMEN_BY_ID: Record<string, Specimen> = Object.fromEntries(
  SPECIMENS.map((s) => [s.id, s]),
);

/** How many categories actually have a reference image. */
export const SPECIMEN_COVERAGE = {
  withImage: SPECIMENS.filter((s) => s.src !== null).length,
  total: SPECIMENS.length,
};

/**
 * Specimens ordered for the grid, but only for categories the pipeline actually
 * published. A plate for a category that no longer exists in the data would be
 * an image with no figures behind it.
 */
export function specimensFor(devices: string[]): Specimen[] {
  if (!devices.length) return SPECIMENS;
  const known = new Set(devices);
  return SPECIMENS.filter((s) => known.has(s.id));
}

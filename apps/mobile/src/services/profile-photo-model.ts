export const PROFILE_PHOTO_DIMENSION = 512;
export const PROFILE_PHOTO_MAX_SOURCE_BYTES = 25 * 1024 * 1024;
export const PROFILE_PHOTO_MAX_SOURCE_DIMENSION = 12_000;
const acceptedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);

export type ProfilePhotoCandidate = {
  type?: string | null;
  mimeType?: string | null;
  fileSize?: number;
  width: number;
  height: number;
};

export function validateProfilePhotoCandidate(asset: ProfilePhotoCandidate): void {
  if (asset.type && asset.type !== 'image') throw new Error('Only images can be used as profile photos');
  if (asset.mimeType && !acceptedTypes.has(asset.mimeType.toLowerCase())) throw new Error('Unsupported profile photo format');
  if (!Number.isFinite(asset.width) || !Number.isFinite(asset.height) || asset.width < 1 || asset.height < 1 ||
    asset.width > PROFILE_PHOTO_MAX_SOURCE_DIMENSION || asset.height > PROFILE_PHOTO_MAX_SOURCE_DIMENSION) {
    throw new Error('Profile photo dimensions are outside the supported limits');
  }
  if (asset.fileSize && asset.fileSize > PROFILE_PHOTO_MAX_SOURCE_BYTES) throw new Error('Profile photo source file is too large');
}

export function profilePhotoCrop(width: number, height: number) {
  const square = Math.min(width, height);
  return { originX: Math.floor((width - square) / 2), originY: Math.floor((height - square) / 2), width: square, height: square };
}

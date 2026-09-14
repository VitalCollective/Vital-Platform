import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { PROFILE_IMAGE_MAX_BYTES } from '../lib/profile-images.ts';
import type { PreparedProfilePhoto } from './profile-photo-api.ts';
import { PROFILE_PHOTO_DIMENSION, profilePhotoCrop, validateProfilePhotoCandidate } from './profile-photo-model.ts';

async function encodedBytes(uri: string, width: number, height: number, compress: number): Promise<ArrayBuffer> {
  const result = await ImageManipulator.manipulateAsync(uri, [
    { crop: profilePhotoCrop(width, height) },
    { resize: { width: PROFILE_PHOTO_DIMENSION, height: PROFILE_PHOTO_DIMENSION } },
  ], { compress, format: ImageManipulator.SaveFormat.JPEG });
  if (result.width !== PROFILE_PHOTO_DIMENSION || result.height !== PROFILE_PHOTO_DIMENSION) {
    throw new Error('Prepared profile photo dimensions could not be verified');
  }
  const response = await fetch(result.uri);
  if (!response.ok) throw new Error('Unable to read the prepared profile photo');
  return response.arrayBuffer();
}

export async function pickPreparedProfilePhoto(): Promise<PreparedProfilePhoto | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 1,
    exif: false, allowsMultipleSelection: false, selectionLimit: 1,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset) throw new Error('No profile photo was selected');
  validateProfilePhotoCandidate(asset);
  for (const quality of [0.82, 0.68, 0.54]) {
    const bytes = await encodedBytes(asset.uri, asset.width, asset.height, quality);
    if (bytes.byteLength > 0 && bytes.byteLength <= PROFILE_IMAGE_MAX_BYTES) return { bytes, contentType: 'image/jpeg' };
  }
  throw new Error('Prepared profile photo is too large');
}

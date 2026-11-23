/** Your own server (Docker): a SQLite file and a folder of photos in DATA_DIR, and settings from the environment. */
import path from 'node:path';
import { localFolderPhotoStore } from '../photos/local-folder';
import { sqliteFileTripStore } from '../stores/sqlite-file';
import type { Platform } from './platform';

const data = path.resolve(process.env.DATA_DIR || 'data');
// Brings the database up to date (migrations/) before the first page is made
const trips = await sqliteFileTripStore(`file:${path.join(data, 'atlas.db')}`);
// Photo keys already start with "photos/"
const photos = localFolderPhotoStore(data);

export const tripStore: Platform['tripStore'] = () => trips;
export const photoStore: Platform['photoStore'] = () => photos;

export const settings: Platform['settings'] = process.env;

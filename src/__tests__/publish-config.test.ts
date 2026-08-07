import { describe, expect, it } from 'vitest';
import { loadPublishConfig } from '../publish-config';

describe('loadPublishConfig', () => {
  it('loads credentials and expands home-relative Drive directories', () => {
    const config = loadPublishConfig(
      {
        HOME: '/Users/tester',
        GOOGLE_DRIVE_LYRIC_DIR: '~/Drive/Lyrics',
        GOOGLE_DRIVE_CHORD_DIR: '/Volumes/Music/Chords',
        PLANNING_CENTER_CLIENT_ID: 'client',
        PLANNING_CENTER_SECRET: 'secret',
        PLANNING_CENTER_USER_AGENT: 'Music Publisher (test@example.com)',
      },
      '/Users/tester',
    );

    expect(config).toEqual({
      googleDrive: {
        lyricDirectory: '/Users/tester/Drive/Lyrics',
        chordDirectory: '/Volumes/Music/Chords',
      },
      planningCenter: {
        clientId: 'client',
        secret: 'secret',
        userAgent: 'Music Publisher (test@example.com)',
      },
    });
  });

  it('reports the missing environment variable', () => {
    expect(() => loadPublishConfig({ HOME: '/tmp' }, '/tmp')).toThrow(
      'GOOGLE_DRIVE_LYRIC_DIR must be set in .env.local',
    );
  });
});

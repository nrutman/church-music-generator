import { describe, it, expect } from 'vitest';
import { fileNameFromTitle } from '../file-name';

describe('fileNameFromTitle', () => {
  it('strips leading "A"', () => {
    expect(fileNameFromTitle("A Christian's Daily Prayer")).toBe('Christians Daily Prayer');
  });

  it('strips leading "The"', () => {
    expect(fileNameFromTitle('The Lord Is My Shepherd')).toBe('Lord Is My Shepherd');
  });

  it('strips leading "An"', () => {
    expect(fileNameFromTitle('An Ancient Song')).toBe('Ancient Song');
  });

  it('removes punctuation', () => {
    expect(fileNameFromTitle('O Church, Come Lift Your Eyes')).toBe('O Church Come Lift Your Eyes');
  });

  it('leaves titles without articles unchanged', () => {
    expect(fileNameFromTitle('Holy Spirit Living Breath of God')).toBe(
      'Holy Spirit Living Breath of God',
    );
  });

  it('does not strip articles mid-title', () => {
    expect(fileNameFromTitle('Awesome Is the Lord Most High')).toBe(
      'Awesome Is the Lord Most High',
    );
  });
});

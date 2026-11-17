import { expect, test, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { PersonAvatar } from '@/components/person-avatar';
import { UserAvatarProfile } from '@/components/user-avatar-profile';
import { avatarPattern } from '@/lib/avatar-pattern';

test('people with the same name receive different stable avatars, independent of their name', () => {
  const { container, rerender } = render(
    <>
      <PersonAvatar identity='user_one' name='Олена' />
      <PersonAvatar identity='user_two' name='Олена' />
    </>
  );
  const avatars = container.querySelectorAll('[data-slot=avatar-fallback] svg');
  expect(avatars).toHaveLength(2);
  expect(avatars[0].innerHTML).not.toBe(avatars[1].innerHTML);
  const original = avatars[0].innerHTML;
  rerender(<PersonAvatar identity='user_one' name='Олена Петренко' />);
  expect(container.querySelector('svg')!.innerHTML).toBe(original);
  const patterns = Array.from({ length: 1000 }, (_, index) =>
    JSON.stringify(avatarPattern(`customer:${index}`))
  );
  expect(new Set(patterns).size).toBe(1000);
});

test('Clerk default images are replaced with the same personal fallback used for team members', () => {
  const { container } = render(
    <UserAvatarProfile
      user={{
        id: 'user_one',
        fullName: 'Олена',
        hasImage: false,
        imageUrl: '/default-clerk-avatar.png',
        emailAddresses: [{ emailAddress: 'olena@example.com' }]
      }}
    />
  );
  expect(container.querySelector('img')).toBeNull();
  const profile = container.querySelector('svg')!.innerHTML;
  const team = render(<PersonAvatar identity='user:user_one' name='Олена' />);
  expect(team.container.querySelector('svg')!.innerHTML).toBe(profile);
});

test('real photos are shown, and a broken photo falls back to the stable generated avatar', async () => {
  const original = window.Image;
  vi.stubGlobal(
    'Image',
    class {
      complete = true;
      naturalWidth = 0;
      set src(value: string) {
        this.naturalWidth = value === '/valid-photo.png' ? 32 : 0;
      }
    }
  );
  try {
    const { container, rerender } = render(
      <PersonAvatar identity='user_photo' name='Олена' imageUrl='/valid-photo.png' />
    );
    await waitFor(() =>
      expect(container.querySelector('img')?.getAttribute('src')).toBe('/valid-photo.png')
    );
    rerender(<PersonAvatar identity='user_photo' name='Олена' imageUrl='/missing-photo.png' />);
    await waitFor(() =>
      expect(container.querySelector('[data-slot=avatar-fallback] svg')).not.toBeNull()
    );
    const fallback = container.querySelector('svg')!.innerHTML;
    rerender(<PersonAvatar identity='user_photo' name='Олена' />);
    expect(container.querySelector('svg')!.innerHTML).toBe(fallback);
  } finally {
    vi.stubGlobal('Image', original);
  }
});

test('phone-only accounts without an email still render a personal avatar', () => {
  const { container } = render(
    <UserAvatarProfile
      showInfo
      user={{ id: 'user_phone', fullName: 'Олена', emailAddresses: [] }}
    />
  );
  expect(container.querySelector('[data-slot=avatar-fallback] svg')).not.toBeNull();
});

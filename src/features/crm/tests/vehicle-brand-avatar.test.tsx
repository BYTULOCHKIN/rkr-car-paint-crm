import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { VehicleBrandAvatar } from '@/components/vehicle-brand-avatar';
import { getVehicleBrandLogo, vehicleBrandLogos } from '@/components/icons';

test('brand aliases share logos and arbitrary/unknown makes use the fallback', () => {
  expect(getVehicleBrandLogo(' Mercedes Benz ')).toBe(getVehicleBrandLogo('MERCEDES-BENZ'));
  expect(getVehicleBrandLogo('Škoda')).toBe(getVehicleBrandLogo('skoda'));
  expect(getVehicleBrandLogo('VW')).toBe(getVehicleBrandLogo('Volkswagen'));
  expect(getVehicleBrandLogo(' zeekr ')).toBe('/vehicle-brands/zeekr.svg');
  for (const make of ['', 'Unknown brand', '../../logo.svg', '__proto__', null, undefined])
    expect(getVehicleBrandLogo(make)).toBeUndefined();
  const { container } = render(<VehicleBrandAvatar make='Unknown brand' />);
  expect(container.querySelector('img')).toBeNull();
  expect(container.querySelector('[data-slot=avatar-fallback] svg')).not.toBeNull();
  expect(container.querySelector('[data-slot=avatar]')?.getAttribute('aria-hidden')).toBe('true');
});

test('registered logos exist locally, have a viewbox and use only neutral gray', () => {
  for (const slug of new Set(Object.values(vehicleBrandLogos))) {
    expect(slug).toMatch(/^[a-z0-9-]+$/);
    const source = readFileSync(resolve('public/vehicle-brands', `${slug}.svg`), 'utf8');
    const svg = new DOMParser().parseFromString(source, 'image/svg+xml');
    expect(svg.querySelector('parsererror')).toBeNull();
    expect(svg.documentElement.hasAttribute('viewBox')).toBe(true);
    expect(svg.querySelector('script, image, foreignObject')).toBeNull();
    for (const element of svg.querySelectorAll('[fill], [stroke]')) {
      for (const attribute of ['fill', 'stroke']) {
        const color = element.getAttribute(attribute);
        if (color) expect(['none', '#737373']).toContain(color);
      }
    }
  }
});

test('loaded logo is shown and a loading failure or unknown make restores the car fallback', async () => {
  const original = window.Image;
  vi.stubGlobal(
    'Image',
    class {
      complete = true;
      naturalWidth = 0;
      set src(value: string) {
        this.naturalWidth = value === '/vehicle-brands/bmw.svg' ? 24 : 0;
      }
    }
  );
  try {
    const { container, rerender } = render(<VehicleBrandAvatar make='BMW' />);
    await waitFor(() =>
      expect(container.querySelector('img')?.getAttribute('src')).toBe('/vehicle-brands/bmw.svg')
    );
    rerender(<VehicleBrandAvatar make='FORD' />);
    await waitFor(() =>
      expect(container.querySelector('[data-slot=avatar-fallback] svg')).not.toBeNull()
    );
    expect(container.querySelector('img')).toBeNull();
    rerender(<VehicleBrandAvatar make='No logo' />);
    expect(container.querySelector('[data-slot=avatar-fallback] svg')).not.toBeNull();
  } finally {
    vi.stubGlobal('Image', original);
  }
});

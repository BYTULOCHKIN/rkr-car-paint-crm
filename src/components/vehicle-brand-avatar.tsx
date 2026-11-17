import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Icons, getVehicleBrandLogo } from '@/components/icons';
import { cn } from '@/lib/utils';

interface VehicleBrandAvatarProps {
  make?: string | null;
  size?: 'default' | 'sm' | 'lg';
  className?: string;
}

/** Decorative: each use must retain the vehicle's visible make/model label. */
export function VehicleBrandAvatar({ make, size, className }: VehicleBrandAvatarProps) {
  const logo = getVehicleBrandLogo(make);
  return (
    <Avatar
      size={size}
      className={cn('bg-neutral-100 dark:bg-neutral-900', className)}
      aria-hidden='true'
    >
      {logo && (
        <AvatarImage
          key={logo}
          src={logo}
          alt=''
          loading='lazy'
          className={cn('object-contain dark:invert', size === 'sm' ? 'p-1' : 'p-1.5')}
        />
      )}
      <AvatarFallback className='bg-neutral-100 text-neutral-500 dark:bg-neutral-900 dark:text-neutral-400'>
        <Icons.car className='size-1/2' aria-hidden />
      </AvatarFallback>
    </Avatar>
  );
}

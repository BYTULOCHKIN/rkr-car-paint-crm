import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { avatarPattern } from '@/lib/avatar-pattern';

interface PersonAvatarProps {
  identity: string;
  name: string;
  imageUrl?: string | null;
  className?: string;
  size?: 'default' | 'sm' | 'lg';
}

/** Names are rendered alongside the decorative avatar in each person row. */
export function PersonAvatar({ identity, name, imageUrl, className, size }: PersonAvatarProps) {
  const pattern = avatarPattern(identity);
  return (
    <Avatar className={className} size={size} aria-hidden='true'>
      {imageUrl && <AvatarImage src={imageUrl} alt={name} />}
      <AvatarFallback className='overflow-hidden'>
        <svg viewBox='0 0 9 9' className='size-full' aria-hidden='true' focusable='false'>
          <rect width='9' height='9' fill={pattern.background} />
          {pattern.cells.map(({ x, y }) => (
            <rect key={`${x}-${y}`} x={x} y={y} width='1' height='1' rx='.12' fill='white' />
          ))}
        </svg>
      </AvatarFallback>
    </Avatar>
  );
}

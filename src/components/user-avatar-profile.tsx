import { PersonAvatar } from '@/components/person-avatar';

interface UserAvatarProfileProps {
  className?: string;
  showInfo?: boolean;
  user: {
    id?: string;
    imageUrl?: string;
    hasImage?: boolean;
    fullName?: string | null;
    emailAddresses: Array<{ emailAddress: string }>;
  } | null;
}

export function UserAvatarProfile({ className, showInfo = false, user }: UserAvatarProfileProps) {
  return (
    <div className='flex items-center gap-2'>
      <PersonAvatar
        identity={`user:${user?.id ?? user?.emailAddresses[0]?.emailAddress ?? 'anonymous'}`}
        name={user?.fullName ?? ''}
        imageUrl={user?.hasImage === false ? undefined : user?.imageUrl}
        className={className}
      />

      {showInfo && (
        <div className='grid flex-1 text-left text-sm leading-tight'>
          <span className='truncate font-semibold'>{user?.fullName || ''}</span>
          <span className='truncate text-xs'>{user?.emailAddresses[0]?.emailAddress || ''}</span>
        </div>
      )}
    </div>
  );
}

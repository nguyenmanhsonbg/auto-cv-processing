type CandidateAvatarProps = {
  name: string;
  className?: string;
};

export function CandidateAvatar({ name, className = '' }: CandidateAvatarProps) {
  const classes = ['cv-avatar', className].filter(Boolean).join(' ');
  return <span className={classes}>{getCandidateInitials(name)}</span>;
}

function getCandidateInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'CV';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

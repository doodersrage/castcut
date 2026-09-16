import { permanentRedirect } from 'next/navigation';

/** Legacy path — canonical Story UI lives at `/story`. */
export default function RoleplayRedirectPage() {
  permanentRedirect('/story');
}

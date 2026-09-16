import { permanentRedirect } from 'next/navigation';

/** Legacy path — canonical Story UI lives at `/m/story`. */
export default function MobilePlayRedirectPage() {
  permanentRedirect('/m/story');
}

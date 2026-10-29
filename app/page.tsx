import IdeApp from './IdeApp';
import { getShare, isShareId } from '@/lib/share/api';

/** Home IDE. Legacy `/?s=<id>` still loads a share on the server. */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ s?: string | string[] }>;
}) {
  const sp = await searchParams;
  const raw = Array.isArray(sp.s) ? sp.s[0] : sp.s;
  if (raw && isShareId(raw)) {
    const initial = await getShare(raw);
    return <IdeApp initial={initial} />;
  }
  return <IdeApp />;
}

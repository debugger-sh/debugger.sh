import { notFound } from 'next/navigation';

import IdeApp from '../IdeApp';
import { getShare, isShareId } from '@/lib/share/api';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ shareId: string }>;
};

/** Share deep link: `/{id}` — snapshot is fetched on the server before paint. */
export default async function SharePage({ params }: PageProps) {
  const { shareId } = await params;
  if (!isShareId(shareId)) notFound();

  const initial = await getShare(shareId);
  return <IdeApp initial={initial} />;
}

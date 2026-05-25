import { ChannelDetail } from "@/components/ChannelDetail";

export const dynamic = "force-dynamic";

export default async function ChannelDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ChannelDetail channelId={id} />;
}

import {
  InquiryChatPanel,
  type InquiryChatPanelProps,
} from "@/components/owner/messages/InquiryChatPanel";

type OwnerMessageDetailPageProps = {
  params: Promise<{
    channelId: string;
  }>;
};

export default async function OwnerMessageDetailPage({ params }: OwnerMessageDetailPageProps) {
  const { channelId } = await params;

  return (
    <InquiryChatPanel
      channelId={channelId as InquiryChatPanelProps["channelId"]}
      ownerMode
      showBackLink
    />
  );
}

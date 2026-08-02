import { LectureReplayClient } from "./LectureReplayClient";

export default function LectureReplayPage({ params }: { params: { token: string } }) {
  return <LectureReplayClient token={params.token} />;
}

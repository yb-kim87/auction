import { MyCourseClient } from "./MyCourseClient";

export default function CourseWatchPage({ params }: { params: { courseId: string } }) {
  return <MyCourseClient courseId={params.courseId} />;
}

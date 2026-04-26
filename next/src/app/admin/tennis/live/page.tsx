import { redirect } from "next/navigation";

export default function AdminTennisLiveRedirectPage() {
  redirect("/admin/tennis?tab=tracked");
}

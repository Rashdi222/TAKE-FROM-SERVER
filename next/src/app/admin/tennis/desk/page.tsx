import { redirect } from "next/navigation";

export default function AdminTennisDeskRedirectPage() {
  redirect("/admin/tennis?tab=desk");
}

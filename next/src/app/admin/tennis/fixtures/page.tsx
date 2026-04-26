import { redirect } from "next/navigation";

export default function AdminTennisFixturesRedirectPage() {
  redirect("/admin/tennis?tab=upcoming");
}

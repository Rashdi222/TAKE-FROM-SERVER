import { useQuery } from "@tanstack/react-query";
import { masterAdminApi } from "@/lib/api";

export function useMasterDashboard() {
  return useQuery({
    queryKey: ["master", "dashboard"],
    queryFn: () => masterAdminApi.dashboard(),
  });
}

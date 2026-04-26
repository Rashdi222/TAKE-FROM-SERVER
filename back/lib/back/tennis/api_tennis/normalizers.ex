defmodule Back.Tennis.ApiTennis.Normalizers do
  alias Back.Tennis.ApiTennis.Normalizers.ContextNormalizer
  alias Back.Tennis.ApiTennis.Normalizers.PointNormalizer

  def normalize_point_payload(payload, existing_state \\ nil) when is_map(payload) do
    PointNormalizer.normalize(payload, existing_state)
  end

  def normalize_rest_context(payload, opts \\ []) when is_map(payload) do
    ContextNormalizer.normalize(payload, opts)
  end
end

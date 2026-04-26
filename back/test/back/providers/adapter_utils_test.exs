defmodule Back.Providers.AdapterUtilsTest do
  use ExUnit.Case, async: true

  alias Back.Providers.AdapterUtils

  test "first_non_nil returns first non-empty value" do
    assert AdapterUtils.first_non_nil([nil, "", "x", "y"]) == "x"
  end

  test "as_list normalizes common wrappers" do
    assert AdapterUtils.as_list(%{"data" => [1]}) == [1]
    assert AdapterUtils.as_list(%{"response" => [2]}) == [2]
    assert AdapterUtils.as_list(%{"result" => [3]}) == [3]
    assert AdapterUtils.as_list(:unknown) == []
  end

  test "normalize_status maps known states" do
    assert AdapterUtils.normalize_status("live") == "live"
    assert AdapterUtils.normalize_status("FT") == "completed"
    assert AdapterUtils.normalize_status("PST") == "upcoming"
    assert AdapterUtils.normalize_status("SUSP") == "upcoming"
    assert AdapterUtils.normalize_status("INT") == "upcoming"
    assert AdapterUtils.normalize_status("CANC") == "cancelled"
    assert AdapterUtils.normalize_status("anything") == "upcoming"
  end

  test "normalize_status supports map status payloads from providers" do
    assert AdapterUtils.normalize_status(%{"type" => "live"}) == "live"
    assert AdapterUtils.normalize_status(%{"name" => "Innings Break"}) == "live"
    assert AdapterUtils.normalize_status(%{"short_name" => "FT"}) == "completed"
    assert AdapterUtils.normalize_status(%{"live" => true}) == "live"
    assert AdapterUtils.normalize_status(%{"is_live" => true}) == "live"
  end
end

defmodule Back.Assistant.MarkdownChunker do
  defmodule Chunk do
    @enforce_keys [:content, :token_count]
    defstruct [:heading_path, :content, :token_count]
  end

  @spec chunk(binary()) :: list(Chunk.t())
  def chunk(markdown) when is_binary(markdown) do
    markdown
    |> String.replace("\r\n", "\n")
    |> String.split("\n")
    |> Enum.reduce(%{headings: [], buffer: [], chunks: []}, &reduce_line/2)
    |> flush_buffer()
    |> Map.fetch!(:chunks)
    |> case do
      [] ->
        trimmed = String.trim(markdown)

        if trimmed == "" do
          []
        else
          [%Chunk{heading_path: nil, content: trimmed, token_count: token_count(trimmed)}]
        end

      chunks ->
        chunks
    end
  end

  defp reduce_line(line, state) do
    trimmed = String.trim(line)

    cond do
      heading_line?(trimmed) ->
        state
        |> flush_buffer()
        |> update_headings(trimmed)

      trimmed == "" ->
        flush_buffer(state)

      true ->
        Map.update!(state, :buffer, &[trimmed | &1])
    end
  end

  defp flush_buffer(%{buffer: []} = state), do: state

  defp flush_buffer(%{headings: headings, buffer: buffer, chunks: chunks} = state) do
    content =
      buffer
      |> Enum.reverse()
      |> Enum.join("\n")
      |> String.trim()

    chunk = %Chunk{
      heading_path: heading_path(headings),
      content: content,
      token_count: token_count(content)
    }

    %{state | buffer: [], chunks: chunks ++ [chunk]}
  end

  defp update_headings(state, line) do
    level = heading_level(line)
    title = heading_title(line)
    kept = Enum.take(state.headings, max(level - 1, 0))
    %{state | headings: kept ++ [title]}
  end

  defp heading_line?(<<"#", _::binary>> = line), do: Regex.match?(~r/^\#{1,6}\s+.+$/, line)
  defp heading_line?(_), do: false

  defp heading_level(line) do
    line
    |> String.split(" ", parts: 2)
    |> hd()
    |> String.length()
  end

  defp heading_title(line) do
    line
    |> Regex.replace(~r/^\#{1,6}\s+/, "")
    |> String.trim()
  end

  defp heading_path([]), do: nil
  defp heading_path(headings), do: Enum.join(headings, " > ")

  defp token_count(content) do
    content
    |> String.split(~r/\s+/, trim: true)
    |> length()
  end
end

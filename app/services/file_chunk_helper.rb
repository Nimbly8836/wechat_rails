class FileChunkHelper
  INITIAL_CHUNK_SIZE = 1024

  def self.calculate_chunks(total_size, chunk_size = nil)
    total = total_size.to_i
    return [] if total <= 0

    size = chunk_size.to_i
    size = INITIAL_CHUNK_SIZE if size <= 0

    chunks = []
    position = 0

    while position < total
      current = [size, total - position].min
      chunks << { start_pos: position, data_len: current }
      position += current
    end

    chunks
  end

  def self.chunk(total_size, index, chunk_size = nil)
    calculate_chunks(total_size, chunk_size)[index]
  end
end

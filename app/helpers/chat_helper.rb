module ChatHelper
  def format_timestamp(timestamp)
    return "" unless timestamp

    time = timestamp.is_a?(Time) ? timestamp : Time.parse(timestamp.to_s)

    if time.to_date == Date.today
      time.strftime("%H:%M")
    elsif time > Time.now - 7.days
      "#{(Date.today - time.to_date).to_i}天前"
    else
      time.strftime("%m-%d")
    end
  rescue
    ""
  end
end

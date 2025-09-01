# app/models/wechat_protocol.rb
module WechatProtocol
  PROTOCOLS = {
    'iPad' => 'iPad',
    'Car' => 'Car',
    'APad' => '安卓Pad',
    'Mac' => 'Mac',
    'Windows' => 'Windows',
    'WindowsUwp' => 'WindowsUwp',
    'iPadX' => 'iPad绕过验证码',
    'APadX' => '安卓pad 绕过验证码',
    'WindwosUwpX' => 'windwosUwp 绕过验证码'
  }

  def self.options_for_select
    PROTOCOLS.map { |value, label| [label, value] }
  end

  def self.label_for(value)
    PROTOCOLS[value] || '未知'
  end
end

module WechatRequest
  module Message
    # 同步消息请求
    class Sync < Base
      params scene: 0, synckey: ""
    end

    # 发送文本消息
    class SendText < Base
      params(at: "", type: 0) { [ :toWxid, :content ] }
    end

    # 发送应用消息
    class SendApp < Base
      params(type: 0) { [ :toWxid, :xml ] }
    end

    # 撤销消息
    class Revoke < Base
      params { [ :clientMsgId, :createTime, :newMsgId, :toUserName ] }
    end

    # 发送 CDN 文件
    class SendCdnFile < Base
      params { [ :toWxid, :content ] }
    end

    # 发送 CDN 图片
    class SendCdnImg < Base
      params { [ :toWxid, :content ] }
    end

    # 发送 CDN 视频
    class SendCdnVideo < Base
      params { [ :toWxid, :content ] }
    end

    # 发送表情
    class SendEmoji < Base
      params { [ :toWxid, :base64 ] }
    end

    # 发送视频
    class SendVideo < Base
      params { [ :toWxid, :content ] }
    end

    # 发送语音
    class SendVoice < Base
      params { [ :toWxid, :content, :voiceType, :voiceTime ] }
    end

    # 分享名片
    class ShareCard < Base
      params { [ :toWxid, :cardWxId, :cardNickName, :cardAlias ] }
    end

    # 分享链接
    class ShareLink < Base
      params { [ :toWxid, :type, :desc, :xml ] }
    end

    # 分享位置
    class ShareLocation < Base
      params { [ :toWxid, :location ] }
    end

    # 分享视频
    class ShareVideo < Base
      params { [ :toWxid, :xml ] }
    end

    # 上传图片
    class UploadImg < Base
      params { [ :toWxid, :base64 ] }
    end
  end
end

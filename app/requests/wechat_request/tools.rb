module WechatRequest
  module Tools
    # CDN 下载高清图片
    class CdnDownloadImage < Base
      params { [ :fileAesKey, :fileNo ] } # 根据实际定义添加必填参数
    end

    # 收藏/聊天记录 recorditem CDN 下载
    class CdnDownloadRecordItem < Base
      params { [ :cdnDataUrl, :cdnDataKey, :dataId, :fullMd5, :dataSize, :isThumb ] }

      def self.api_key_for(name)
        {
          cdnDataUrl: "CdnDataUrl",
          cdnDataKey: "CdnDataKey",
          dataId: "DataId",
          fullMd5: "FullMd5",
          dataSize: "DataSize",
          isThumb: "IsThumb"
        }.fetch(name.to_sym) { super }
      end
    end

    # 合并转发 RecordItem 转发到文件传输助手后下载
    class ForwardRecordItemToFileHelperDownload < Base
      params(
        msgID: nil,
        newMsgID: nil,
        sourceXml: nil,
        xml: nil,
        talker: nil,
        senderUserName: nil,
        itemIndex: nil,
        isThumb: 0,
        skipForward: nil,
        diagnostic: nil,
        localID: nil,
        msgSeq: nil,
        msgType: nil,
        keyword: nil
      )

      def self.api_key_for(name)
        {
          msgID: "MsgID",
          newMsgID: "NewMsgID",
          sourceXml: "SourceXml",
          xml: "Xml",
          talker: "Talker",
          senderUserName: "SenderUserName",
          itemIndex: "ItemIndex",
          isThumb: "IsThumb",
          skipForward: "SkipForward",
          diagnostic: "Diagnostic",
          localID: "LocalID",
          msgSeq: "MsgSeq",
          msgType: "MsgType",
          keyword: "Keyword"
        }.fetch(name.to_sym) { super }
      end
    end

    # 文件下载
    class DownloadFile < Base
      params { [ :appId, :attachId, :dataLen, :section, :userName ] }

      def self.api_key_for(name)
        return "AppID" if name.to_sym == :appId

        super
      end
    end

    # 高清图片下载
    class DownloadImg < Base
      params compressType: 0 do
        [ :toWxid, :section, :msgId, :dataLen ]
      end
    end

    # 视频下载
    class DownloadVideo < Base
      params { [ :toWxid, :section, :msgId, :dataLen, :compressType ] }
    end

    # 语音下载
    class DownloadVoice < Base
      params { [ :bufid, :fromUserName, :length, :msgId ] }
    end

    # 生成支付二维码
    class GeneratePayQCode < Base
      params { [] }
    end

    # GetA8Key
    class GetA8Key < Base
      params { [ :opCode, :scene, :codeType, :codeVersion ] }
    end

    # 获取余额及银行卡信息
    class GetBandCardList < Base
      params { [] }
    end

    # 获取绑定硬件设备
    class GetBoundHardDevices < Base
      params { [] }
    end

    # 获取 CDN DNS 信息
    class GetCdnDns < Base
      params { [] }
    end

    # OauthSdkApp
    class OauthSdkApp < Base
      params { [ :appId ] } # 根据实际定义添加字段
    end

    # 第三方 APP 授权
    class ThirdAppGrant < Base
      params { [ :appId, :authCode ] } # 根据实际定义添加字段
    end

    # 修改微信步数
    class UpdateStepNumberApi < Base
      params { [ :step ] }
    end

    # 文件上传
    class UploadFile < Base
      params { [ :file ] }
    end

    # 文件上传（二进制）
    class UploadFileBinary < Base
      params { [] }
    end

    # 设置/删除代理 IP
    class SetProxy < Base
      params { [ :proxy ] }
    end
  end
end

module WechatRequest
  module Tools
    # CDN 下载高清图片
    class CdnDownloadImage < Base
      params { [:fileAesKey, :fileNo] } # 根据实际定义添加必填参数
    end

    # 文件下载
    class DownloadFile < Base
      params { [:dataLen, :xml ] }
    end

    # 高清图片下载
    class DownloadImg < Base
      params { [:toWxid, :section, :ssgId, :dataLen, :compressType] }
    end

    # 视频下载
    class DownloadVideo < Base
      params { [:toWxid, :section, :ssgId, :dataLen, :compressType] }
    end

    # 语音下载
    class DownloadVoice < Base
      params { [:bufid, :fromUserName, :length, :msgId] }
    end

    # 生成支付二维码
    class GeneratePayQCode < Base
      params { [] }
    end

    # GetA8Key
    class GetA8Key < Base
      params { [:opCode, :scene, :codeType, :codeVersion] }
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
      params { [:appId] } # 根据实际定义添加字段
    end

    # 第三方 APP 授权
    class ThirdAppGrant < Base
      params { [:appId, :authCode] } # 根据实际定义添加字段
    end

    # 修改微信步数
    class UpdateStepNumberApi < Base
      params { [:step] }
    end

    # 文件上传
    class UploadFile < Base
      params { [:file] }
    end

    # 文件上传（二进制）
    class UploadFileBinary < Base
      params { [:file] }
    end

    # 设置/删除代理 IP
    class SetProxy < Base
      params { [:proxy] }
    end
  end
end

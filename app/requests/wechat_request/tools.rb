module WechatRequest
  module Tools
    # CDN 下载高清图片
    class CdnDownloadImage < Base
      params { [:url, :wxid] }  # 根据实际定义添加必填参数
    end

    # 文件下载
    class DownloadFile < Base
      params { [:dataLen, :xml, :wxid] }
    end

    # 高清图片下载
    class DownloadImg < Base
      params { [:dataLen, :xml, :wxid] }
    end

    # 视频下载
    class DownloadVideo < Base
      params { [:dataLen, :xml, :wxid] }
    end

    # 语音下载
    class DownloadVoice < Base
      params { [:bufid, :fromUserName, :length, :msgId, :wxid] }  # 假设需要 voiceId，根据实际定义调整
    end

    # 生成支付二维码
    class GeneratePayQCode < Base
      params { [:wxid] }
    end

    # GetA8Key
    class GetA8Key < Base
      params { [:opCode, :scene, :codeType, :codeVersion, :wxid] }
    end

    # 获取余额及银行卡信息
    class GetBandCardList < Base
      params { [:wxid] }
    end

    # 获取绑定硬件设备
    class GetBoundHardDevices < Base
      params { [:wxid] }
    end

    # 获取 CDN DNS 信息
    class GetCdnDns < Base
      params { [:wxid] }
    end

    # OauthSdkApp
    class OauthSdkApp < Base
      params { [:appId, :wxid] } # 根据实际定义添加字段
    end

    # 第三方 APP 授权
    class ThirdAppGrant < Base
      params { [:appId, :authCode, :wxid] } # 根据实际定义添加字段
    end

    # 修改微信步数
    class UpdateStepNumberApi < Base
      params { [:step, :wxid] }
    end

    # 文件上传
    class UploadFile < Base
      params { [:file, :wxid] }
    end

    # 文件上传（二进制）
    class UploadFileBinary < Base
      params { [:file, :wxid] }
    end

    # 设置/删除代理 IP
    class SetProxy < Base
      params { [:proxy, :wxid] }
    end
  end
end

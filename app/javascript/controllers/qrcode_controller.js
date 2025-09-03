import {Controller} from "@hotwired/stimulus"

export default class extends Controller {
  static values = {
    uuid: String,
    protocol: String,
  }

  static targets = ["qrcodeImage", "retryButton", "loginStatus"]

  connect() {
    console.log("qrcode controller connect", this.uuidValue, this.protocolValue)
    // Hide retry button initially
    this.hideRetryButton();
    
    if (this.uuidValue) {
      this.startStatusCheck();
    }
  }

  disconnect() {
    // 清除定时器，防止内存泄漏
    this.stopStatusCheck();
  }

  startStatusCheck() {
    // 停止之前可能存在的定时器
    this.stopStatusCheck();

    // 设置新的定时器，每秒检查一次状态
    this.statusCheckInterval = setInterval(() => {
      this.checkLoginStatus();
    }, 1100);

    // 立即进行第一次检查
    this.checkLoginStatus();
  }

  stopStatusCheck() {
    if (this.statusCheckInterval) {
      clearInterval(this.statusCheckInterval);
      this.statusCheckInterval = null;
    }
  }

  checkLoginStatus() {
    fetch('/check_login_status', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-CSRF-Token': document.querySelector(
            'meta[name="csrf-token"]').content
      },
      body: JSON.stringify({
        uuid: this.uuidValue,
      })
    })
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      console.log("Login status check result:", data);
      this.updateStatusDisplay(data);
    })
    .catch(error => {
      console.error("Error checking login status:", error);
      document.getElementById('login-status').textContent = '检查状态时出错，请重试';
      this.showRetryButton();
      this.stopStatusCheck();
    });
  }

  updateStatusDisplay(data) {
    const statusElement = document.getElementById('login-status');
    const countdownElement = document.getElementById('countdown');

    if (data.Success) {
      this.hideRetryButton();
      
      if (data.Data) {
        // 根据API返回的状态更新显示
        if (data.Data.status === 0) {
          statusElement.textContent = '等待扫描...';
          if (data.Data.expiredTime) {
            countdownElement.textContent = data.Data.expiredTime;
          }
        } else if (data.Data.status === 1) {
          statusElement.textContent = '已扫描，请在手机上确认登录';
        } else if (data.Data.baseResponse?.ret === 0) {
          statusElement.textContent = '登录成功！正在跳转...';
          this.stopStatusCheck(); // 停止检查

          // 登录成功后跳转到首页或其他页面
          setTimeout(() => {
            window.location.href = '/'; // 可以替换为其他目标页面
          }, 1500);
        } else {
          statusElement.textContent = '等待扫描...';
        }
      } else {
        statusElement.textContent = '等待扫描...';
      }
    } else {
      // API返回失败
      this.stopStatusCheck(); // 停止检查
      statusElement.textContent = data.Message || '检查状态失败';
      this.showRetryButton(); // Show retry button on failure
    }
  }

  reGetQrCode() {
    console.log("reGetQrCode", this.protocolValue);
    // Hide the retry button while requesting
    this.hideRetryButton();
    
    document.getElementById('login-status').textContent = '正在获取新的二维码...';
    
    fetch('/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-CSRF-Token': document.querySelector(
            'meta[name="csrf-token"]').content
      },
      body: JSON.stringify({
        protocol: this.protocolValue,
      })
    })
    .then(response => {
      console.log("Response from server:", response);
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      console.log("New QR code result:", data);
      if (data.status === 'success' && data.data) {
        // Update the QR code image
        if (data.data.qrcode_url) {
          this.updateQRCodeImage(data.Data.qrcode_url);
        } else if (data.Data.qrcode_base64) {
          this.updateQRCodeImage(data.Data.qrcode_base64);
        }
        
        // Update UUID value and restart status checking
        if (data.data.uuid) {
          this.uuidValue = data.data.uuid;
          document.getElementById('login-status').textContent = '等待扫描...';
          this.startStatusCheck();
        } else {
          throw new Error('No UUID returned from server');
        }
      } else {
        throw new Error(data.message || '获取新二维码失败');
      }
    })
    .catch(error => {
      console.error("Error getting new QR code:", error);
      document.getElementById('login-status').textContent = '获取新二维码失败，请重试';
      this.showRetryButton();
    });
  }
  
  // Helper method to update QR code image
  updateQRCodeImage(src) {
    const qrImageContainer = document.querySelector('.qrcode-image');
    let imgElement = qrImageContainer.querySelector('img');
    
    // If no img element exists, create one
    if (!imgElement) {
      imgElement = document.createElement('img');
      imgElement.alt = '微信登录二维码';
      
      // Remove any error message if present
      const errorElement = qrImageContainer.querySelector('.error');
      if (errorElement) {
        qrImageContainer.removeChild(errorElement);
      }
      
      qrImageContainer.appendChild(imgElement);
    }
    
    imgElement.src = src;
  }
  
  // Helper methods to show/hide retry button
  showRetryButton() {
    const retryButton = document.getElementById('login-error');
    if (retryButton) {
      retryButton.style.display = 'block';
    }
  }
  
  hideRetryButton() {
    const retryButton = document.getElementById('login-error');
    if (retryButton) {
      retryButton.style.display = 'none';
    }
  }
}

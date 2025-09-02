import {Controller} from "@hotwired/stimulus"

export default class extends Controller {
  static values = {
    uuid: String,
    protocol: String,
  }

  connect() {
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
          document.getElementById(
              'login-status').textContent = '检查状态时出错，请刷新页面重试';
        });
  }

  updateStatusDisplay(data) {
    const statusElement = document.getElementById('login-status');
    const countdownElement = document.getElementById('countdown');

    if (data.Success) {
      if (data.Data) {
        // 根据API返回的状态更新显示
        if (data.Data.status === 0) {
          statusElement.textContent = '等待扫描...';
          if (data.Data.expiredTime) {
            countdownElement.textContent = data.Data.expiredTime;
          }
        } else if (data.Data.status === 1) {
          statusElement.textContent = '已扫描，请在手机上确认登录';
        }  else if (data.Data.baseResponse?.ret == 0 ) {
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
    }
  }

}

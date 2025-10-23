import {Controller} from "@hotwired/stimulus"

export default class extends Controller {

  connect() {
    console.log("connect login controller")
  }

  // 重新登录
  reLogin() {
    const reLoginUserSelect = document.querySelector('.form-select');
    const selectWxId = reLoginUserSelect?.value

    if (selectWxId) {
      fetch("/re-login", {
        method: "POST",
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-CSRF-Token': document.querySelector(
              'meta[name="csrf-token"]').content
        },
        body: JSON.stringify({
          user_name: selectWxId,
        })
      }).then(response => {
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        return response.json();
      })
          .then(data => {
            console.log("Login status check result:", data);
            // 登录成功后跳转到聊天界面
            setTimeout(() => {
              window.location.href = '/chat';
            }, 1500);
          })
          .catch(error => {

          });
    }

  }

  showScanQrCode() {
    const loggedIn = this.element.querySelector("#logged-in");
    const scanLogin = this.element.querySelector("#scan-login");

    if (!loggedIn || !scanLogin) {
      return;
    }

    const showingScan = scanLogin.style.display === "block";

    loggedIn.style.display = showingScan ? "block" : "none";
    scanLogin.style.display = showingScan ? "none" : "block";
  }
}
# Pin npm packages by running ./bin/importmap

pin "application"
pin "@hotwired/turbo-rails", to: "turbo.min.js"
pin "@hotwired/stimulus", to: "stimulus.min.js"
pin "@hotwired/stimulus-loading", to: "stimulus-loading.js"
pin_all_from "app/javascript/controllers", under: "controllers"
pin_all_from "app/javascript/utils", under: "utils"
pin "@rails/actioncable", to: "actioncable.esm.js"
pin "codemirror", to: "https://esm.sh/codemirror@6.0.2"
pin "@codemirror/lang-javascript", to: "https://esm.sh/@codemirror/lang-javascript@6.2.5"
pin "@codemirror/theme-one-dark", to: "https://esm.sh/@codemirror/theme-one-dark@6.1.3"

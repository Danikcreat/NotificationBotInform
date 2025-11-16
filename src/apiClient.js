import axios from "axios";

export default class ApiClient {
  constructor({
    baseUrl,
    logger,
    apiToken,
    serviceLogin,
    servicePassword,
    timeout = 15000,
  }) {
    this.baseUrl = (baseUrl || "").replace(/\/$/, "");
    this.logger = logger;
    this.staticToken = apiToken || null;
    this.serviceLogin = serviceLogin || null;
    this.servicePassword = servicePassword || null;
    this.http = axios.create({
      baseURL: this.baseUrl,
      timeout,
    });
    this.token = this.staticToken || null;
  }

  async ensureAuth() {
    if (this.token) return;
    if (this.staticToken) {
      this.token = this.staticToken;
      return;
    }
    await this.login();
  }

  async login(force = false) {
    if (!force && this.staticToken) return this.staticToken;
    if (!this.serviceLogin || !this.servicePassword) {
      throw new Error(
        "API credentials are not provided. Set API_TOKEN or API_SERVICE_LOGIN/API_SERVICE_PASSWORD."
      );
    }
    const payload = { login: this.serviceLogin, password: this.servicePassword };
    const response = await axios.post(`${this.baseUrl}/auth/login`, payload);
    this.token = response.data?.token;
    if (!this.token) {
      throw new Error("API login succeeded but token is missing in response");
    }
    this.logger?.info({ user: response.data?.user?.login }, "Authenticated against API");
    return this.token;
  }

  async request(config, { retried = false } = {}) {
    await this.ensureAuth();
    try {
      const response = await this.http.request({
        method: config.method || "get",
        url: config.url,
        data: config.data,
        params: config.params,
        headers: {
          ...(config.headers || {}),
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        },
      });
      return response.data;
    } catch (error) {
      const status = error.response?.status;
      if (status === 401 && !this.staticToken && !retried) {
        this.logger?.warn("API token expired, re-authenticating...");
        await this.login(true);
        return this.request(config, { retried: true });
      }
      const message =
        error.response?.data?.message ||
        error.message ||
        `API request failed for ${config.method || "get"} ${config.url}`;
      const apiError = new Error(message);
      apiError.status = status;
      apiError.cause = error;
      throw apiError;
    }
  }

  async getUsers() {
    const data = await this.request({ url: "/users" });
    return Array.isArray(data?.users) ? data.users : [];
  }

  async updateUserTelegram(userId, payload) {
    if (!userId) {
      throw new Error("User id is required for Telegram update");
    }
    const data = await this.request({
      method: "put",
      url: `/users/${userId}/telegram`,
      data: payload,
    });
    return data?.user;
  }

  async getTasks() {
    const data = await this.request({ url: "/tasks" });
    if (Array.isArray(data)) {
      return data;
    }
    return Array.isArray(data?.tasks) ? data.tasks : [];
  }
}

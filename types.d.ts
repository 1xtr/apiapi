import { AxiosRequestConfig } from 'axios'

export interface I_RateLimitOptions {
  maxRequests?: number
  perMilliseconds?: number
  maxRPS?: number
}

export interface IApiClientOptions {
  rateLimitOptions?: I_RateLimitOptions
  baseUrl: string
  headers?: Record<string, string | number | boolean>
  transformResponse?: Object | Function
  transformRequest?: Object | Function
  required?: Object
  errorHandler?: Object | Function
  responseType?: Object | Function
  rawResponse?: any
  query?: Object
  body?: Object
  methods?: Record<string, string>
  axiosOptions: AxiosRequestConfig
}

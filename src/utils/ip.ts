export function reverseIp(ip: string): string {
  return ip.split(".").reverse().join(".");
}

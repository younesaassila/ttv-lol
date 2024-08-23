import { Address4, Address6 } from "ip-address";

const ip4LinkLocalSubnet = new Address4("169.254.0.0/16");
const ip4LoopbackSubnet = new Address4("127.0.0.0/8");
const ip4PrivateASubnet = new Address4("10.0.0.0/8");
const ip4PrivateBSubnet = new Address4("172.16.0.0/12");
const ip4PrivateCSubnet = new Address4("192.168.0.0/16");

export default function isPrivateIp(address: string): boolean {
  try {
    const ip4 = new Address4(address);
    return (
      ip4.isInSubnet(ip4LinkLocalSubnet) ||
      ip4.isInSubnet(ip4LoopbackSubnet) ||
      ip4.isInSubnet(ip4PrivateASubnet) ||
      ip4.isInSubnet(ip4PrivateBSubnet) ||
      ip4.isInSubnet(ip4PrivateCSubnet)
    );
  } catch (error) {}

  try {
    const ip6 = new Address6(address);
    return ip6.isLinkLocal() || ip6.isLoopback();
  } catch (error) {}

  return false;
}

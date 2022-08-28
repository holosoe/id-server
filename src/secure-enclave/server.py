# This script runs in the secure enclave. It services 
# requests from the parent instance for proof generation.

# Forked from:
# https://github.com/aws/aws-nitro-enclaves-samples/blob/main/vsock_sample/py/vsock-sample.py

import argparse
import socket
import sys


PORT = 5005
BUFF_SIZE = 1024

class VsockListener:
    """Server"""
    def __init__(self, conn_backlog=128):
        self.conn_backlog = conn_backlog
        self.latest_message = bytearray()

    def bind(self, port):
        """Bind and listen for connections on the specified port"""
        self.sock = socket.socket(socket.AF_VSOCK, socket.SOCK_STREAM)
        self.sock.bind((socket.VMADDR_CID_ANY, port))
        self.sock.listen(self.conn_backlog)

    def recv_data(self):
        """Receive data from a remote endpoint"""
        while True:
            (from_client, (remote_cid, remote_port)) = self.sock.accept()
            # Read BUFF_SIZE bytes at a time
            while True:
                try:
                    data = from_client.recv(BUFF_SIZE)
                except socket.error:
                    break
                if not data:
                    break
                if 'start_message' in data.decode():
                    self.latest_message = bytearray()
                elif 'end_message' in data.decode():
                    print(self.latest_message.decode(), flush=True)
                    # TODO: 
                    # Send latest_message to node script. 
                    # Generate proofs.
                    # Encrypt and return.
                    break
                else:
                    self.latest_message.extend(data)
            from_client.close()

    def send_data(self, data):
        """Send data to a remote endpoint"""
        while True:
            (to_client, (remote_cid, remote_port)) = self.sock.accept()
            to_client.sendall(data)
            to_client.close()


def server_handler(args):
    server = VsockListener()
    server.bind(PORT)
    server.recv_data()


def main():
    parser = argparse.ArgumentParser(prog='vsock-sample')
    subparsers = parser.add_subparsers(title="options")

    server_parser = subparsers.add_parser("server", description="Server",
                                          help="Listen on a given port.")
    server_parser.set_defaults(func=server_handler)

    if len(sys.argv) < 2:
        parser.print_usage()
        sys.exit(1)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
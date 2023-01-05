import { expect } from "chai";
import hre, { ethers } from "hardhat";
import {
    AddressManager,
    SignalService,
    TestLibBridgeSend,
    EtherVault,
} from "../../../typechain";
import { Message } from "../../utils/message";

describe("LibBridgeSend", function () {
    let owner: any;
    let nonOwner: any;
    let etherVaultOwner: any;
    let libSend: TestLibBridgeSend;
    let blockChainId: number;
    const enabledDestChainId = 100;
    const srcChainId = 1;

    before(async function () {
        [owner, nonOwner, etherVaultOwner] = await ethers.getSigners();
        blockChainId = hre.network.config.chainId ?? 0;
    });

    beforeEach(async function () {
        const addressManager: AddressManager = await (
            await ethers.getContractFactory("AddressManager")
        ).deploy();
        await addressManager.init();

        const etherVault: EtherVault = await (
            await ethers.getContractFactory("EtherVault")
        )
            .connect(etherVaultOwner)
            .deploy();

        await etherVault.deployed();
        await etherVault.init(addressManager.address);

        await addressManager.setAddress(
            `${blockChainId}.ether_vault`,
            etherVault.address
        );

        const libTrieProof = await (
            await ethers.getContractFactory("LibTrieProof")
        )
            .connect(etherVaultOwner)
            .deploy();

        const SignalServiceFactory = await ethers.getContractFactory(
            "SignalService",
            {
                libraries: {
                    LibTrieProof: libTrieProof.address,
                },
            }
        );

        const signalService: SignalService = await SignalServiceFactory.connect(
            etherVaultOwner
        ).deploy();

        await signalService
            .connect(etherVaultOwner)
            .init(addressManager.address);

        await addressManager.setAddress(
            `${blockChainId}.signal_service`,
            signalService.address
        );

        libSend = await (await ethers.getContractFactory("TestLibBridgeSend"))
            .connect(owner)
            .deploy();

        await libSend.init(addressManager.address);
        await etherVault
            .connect(etherVaultOwner)
            .authorize(libSend.address, true);
    });

    describe("enableDestChain()", async function () {
        it("should throw when chainId <= 0", async function () {
            await expect(libSend.enableDestChain(0, true)).to.be.revertedWith(
                "B:chainId"
            );
        });

        it("should throw when chainId == block.chainId", async function () {
            await expect(
                libSend.enableDestChain(blockChainId, true)
            ).to.be.revertedWith("B:chainId");
        });

        it("should emit DestChainEnabled() event", async function () {
            expect(
                await libSend.enableDestChain(enabledDestChainId, true)
            ).to.emit(libSend, "DestChainEnabled");
        });
    });

    describe("sendMessage()", async function () {
        it("should throw when message.owner == address(0)", async function () {
            const nonEnabledDestChain = 2;

            const message: Message = {
                id: 1,
                sender: owner.address,
                srcChainId: srcChainId,
                destChainId: nonEnabledDestChain,
                owner: ethers.constants.AddressZero,
                to: nonOwner.address,
                refundAddress: owner.address,
                depositValue: 1,
                callValue: 1,
                processingFee: 1,
                gasLimit: 100,
                data: ethers.constants.HashZero,
                memo: "",
            };

            await expect(libSend.sendMessage(message)).to.be.revertedWith(
                "B:owner"
            );
        });

        it("should throw when destchainId == block.chainId", async function () {
            const message: Message = {
                id: 1,
                sender: owner.address,
                srcChainId: srcChainId,
                destChainId: blockChainId,
                owner: owner.address,
                to: nonOwner.address,
                refundAddress: owner.address,
                depositValue: 1,
                callValue: 1,
                processingFee: 1,
                gasLimit: 100,
                data: ethers.constants.HashZero,
                memo: "",
            };

            await expect(libSend.sendMessage(message)).to.be.revertedWith(
                "B:destChainId"
            );
        });

        it("should throw when destChainId has not yet been enabled", async function () {
            const nonEnabledDestChain = 2;

            const message: Message = {
                id: 1,
                sender: owner.address,
                srcChainId: srcChainId,
                destChainId: nonEnabledDestChain,
                owner: owner.address,
                to: nonOwner.address,
                refundAddress: owner.address,
                depositValue: 1,
                callValue: 1,
                processingFee: 1,
                gasLimit: 100,
                data: ethers.constants.HashZero,
                memo: "",
            };

            await expect(libSend.sendMessage(message)).to.be.revertedWith(
                "B:destChainId"
            );
        });

        it("should throw when expectedAmount != msg.value", async function () {
            await libSend.enableDestChain(enabledDestChainId, true);

            const message: Message = {
                id: 1,
                sender: owner.address,
                srcChainId: srcChainId,
                destChainId: enabledDestChainId,
                owner: owner.address,
                to: nonOwner.address,
                refundAddress: owner.address,
                depositValue: 1,
                callValue: 1,
                processingFee: 1,
                gasLimit: 100,
                data: ethers.constants.HashZero,
                memo: "",
            };

            await expect(libSend.sendMessage(message)).to.be.revertedWith(
                "B:value"
            );
        });

        it("should emit MessageSent() event and signal should be hashed correctly", async function () {
            await libSend.enableDestChain(enabledDestChainId, true);

            const message: Message = {
                id: 1,
                sender: owner.address,
                srcChainId: srcChainId,
                destChainId: enabledDestChainId,
                owner: owner.address,
                to: nonOwner.address,
                refundAddress: owner.address,
                depositValue: 1,
                callValue: 1,
                processingFee: 1,
                gasLimit: 100,
                data: ethers.constants.HashZero,
                memo: "",
            };

            const expectedAmount =
                message.depositValue +
                message.callValue +
                message.processingFee;

            expect(
                await libSend.sendMessage(message, {
                    value: expectedAmount,
                })
            ).to.emit(libSend, "MessageSent");
        });
    });
});

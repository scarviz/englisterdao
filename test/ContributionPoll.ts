import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import { ethers } from "hardhat";

describe("ContributionPoll", function () {
    // We define a fixture to reuse the same setup in every test.
    // We use loadFixture to run this setup once, snapshot that state,
    // and reset Hardhat Network to that snapshopt in every test.
    async function deploy() {
        // Contracts are deployed using the first signer/account by default
        const [owner, otherAccount, otherAccount2] = await ethers.getSigners();

        const ContributionPoll = await ethers.getContractFactory("ContributionPoll");
        const poll = await ContributionPoll.deploy();

        // Deploy Token
        const EnglisterToken = await ethers.getContractFactory("DAOToken");
        const NAME = "Englister"
        const SYMBOL = "ENG"
        const INITIAL_SUPPLY = 100;
        const token = await EnglisterToken.deploy(NAME, SYMBOL, INITIAL_SUPPLY);

        // 権限設定
        await poll.setDaoTokenAddress(token.address);
        await token.setupMinterRole(poll.address);


        return { token, poll, owner, otherAccount, otherAccount2 };
    }

    describe("Deployment", function () {
        it("poll Idの初期値は0", async function () {
            const { poll } = await loadFixture(deploy);
            expect(await poll.pollId()).to.equal(0);
        });
    });

    describe("settleCurrentPollAndCreateNewPoll", function () {
        it("Pollを終了すると、pollIdがインクリメントされる", async function () {
            const { poll } = await loadFixture(deploy);
            await poll.settleCurrentPollAndCreateNewPoll();
            expect(await poll.pollId()).to.equal(1);
        });
    });

    describe("Candidate", function () {
        it("最初は候補者は誰もいない", async function () {
            const { poll } = await loadFixture(deploy);
            const candidates = await poll.getCandidates();
            expect(candidates).to.lengthOf(0);
        });

        it("立候補すると候補者が追加される(1人)", async function () {
            const { poll } = await loadFixture(deploy);
            await poll.candidateToContributionPoll()
            const candidates = await poll.getCandidates();
            expect(candidates).to.lengthOf(1);
        });

        it("立候補すると候補者が追加される(2人)", async function () {
            const { poll, otherAccount } = await loadFixture(deploy);
            await poll.candidateToContributionPoll()
            await poll.connect(otherAccount).candidateToContributionPoll()
            const candidates = await poll.getCandidates();
            expect(candidates).to.lengthOf(2);
        });

        it("同じ人が立候補することはできない", async function () {
            const { poll } = await loadFixture(deploy);
            await poll.candidateToContributionPoll()
            await expect(poll.candidateToContributionPoll()).to.be.revertedWith("You are already candidate to the current poll.");
            const candidates = await poll.getCandidates();
            expect(candidates).to.lengthOf(1);
        });
    });

    describe("Vote", function () {
        it("候補者がいない状況で投票することはできない", async function () {
            const { poll, owner, token } = await loadFixture(deploy);

            await poll.setDaoTokenAddress(token.address);
            await expect(poll.vote([owner.address], [1])).to.be.revertedWith("The candidate is not in the current poll.");
        });

        it("ゼロ投票はできない", async function () {
            const { poll, token } = await loadFixture(deploy);

            await poll.setDaoTokenAddress(token.address);
            await expect(poll.vote([], [])).to.be.revertedWith("Candidates must not be empty.");
        });

        it("候補者がいれば投票をすることができる", async function () {
            const { poll, otherAccount, token } = await loadFixture(deploy);

            await poll.setDaoTokenAddress(token.address);
            await poll.connect(otherAccount).candidateToContributionPoll()
            await expect(await poll.vote([otherAccount.address], [1])).to.be.not.revertedWith("The candidate is not in the current poll.");
        });

        it("2回投票することはできない", async function () {
            const { poll, otherAccount, token } = await loadFixture(deploy);

            await poll.setDaoTokenAddress(token.address);
            await poll.connect(otherAccount).candidateToContributionPoll()

            await poll.vote([otherAccount.address], [1])
            await expect(poll.vote([otherAccount.address], [1])).to.be.revertedWith("You are already voted.");
        });

        it("DAOトークンのTOP10の保有者でなければ投票できない", async function () {
            const { poll, otherAccount, owner, token } = await loadFixture(deploy);

            await poll.setDaoTokenAddress(token.address);
            await poll.connect(owner).candidateToContributionPoll()

            await expect(poll.connect(otherAccount).vote([owner.address], [1])).to.be.revertedWith("You are not in the top RANK_FOR_VOTE holder.");
        });

        it("投票で21ポイント以上をつけることはできない", async function () {
            const { poll, otherAccount, token } = await loadFixture(deploy);

            await poll.setDaoTokenAddress(token.address);
            await poll.connect(otherAccount).candidateToContributionPoll()

            await expect(poll.vote([otherAccount.address], [21])).to.be.revertedWith("The points are not valid. (points < VOTE_MAX_POINT)");
        });

        it("投票者の数とポイントの数が一致している必要がある", async function () {
            const { poll, otherAccount, token } = await loadFixture(deploy);

            await poll.setDaoTokenAddress(token.address);
            await poll.connect(otherAccount).candidateToContributionPoll()

            await expect(poll.vote([otherAccount.address], [1, 2])).to.be.revertedWith("The number of points is not valid.");
        });

        it("投票がされれば投票結果が保存される(1件)", async function () {
            const { poll, otherAccount, token } = await loadFixture(deploy);

            await poll.setDaoTokenAddress(token.address);
            await poll.connect(otherAccount).candidateToContributionPoll()

            await poll.vote([otherAccount.address], [1])

            const votes = await poll.getVotes();
            expect(votes).to.lengthOf(1);

            //TODO: 投票の中身も念の為チェックする
        });

        it("投票がされれば投票結果が保存される(2件)", async function () {
            const { poll, otherAccount, token } = await loadFixture(deploy);


            // ownerとotherAccountがトークンを持つようにする
            await token.transfer(otherAccount.address, 10);

            await poll.setDaoTokenAddress(token.address);
            await poll.connect(otherAccount).candidateToContributionPoll()

            await poll.vote([otherAccount.address], [1])
            await poll.connect(otherAccount).vote([otherAccount.address], [1])

            const votes = await poll.getVotes();
            expect(votes).to.lengthOf(2);


            //TODO: 投票の中身も念の為チェックする
        });
    });

    describe("Settlement and Totalize", function () {
        it("投票が実施されなかった場合は、誰にもトークンは送られない", async function () {
            const { poll, token, owner } = await loadFixture(deploy);
            await poll.setDaoTokenAddress(token.address);
            await poll.settleCurrentPollAndCreateNewPoll();
            const balance = await token.balanceOf(owner.address);
            expect(balance).to.eq(100);
        });

        it("投票が実施された場合、投票者と貢献者にトークンが送られる(1)", async function () {
            // パターン1: 
            // - 投票者が1人 (owner)
            // - 貢献者が1人 (otherAccount)
            const { token, owner, poll, otherAccount } = await loadFixture(deploy);

            await poll.connect(otherAccount).candidateToContributionPoll()
            await poll.vote([otherAccount.address], [5])

            await poll.settleCurrentPollAndCreateNewPoll();

            const balance = await token.balanceOf(owner.address);
            expect(balance).to.eq(100 + 3000);
            const balance2 = await token.balanceOf(otherAccount.address);
            expect(balance2).to.eq(5000);
        });

        it("投票が実施された場合、投票者と貢献者にトークンが送られる(2)", async function () {
            // パターン2: 
            // - 投票者が2人 (owner, otherAccount2)
            // - 貢献者が1人 (otherAccount)
            const { token, owner, poll, otherAccount, otherAccount2 } = await loadFixture(deploy);

            await token.transfer(otherAccount2.address, 30);
            await poll.connect(otherAccount).candidateToContributionPoll()
            await poll.vote([otherAccount.address], [5])
            await poll.connect(otherAccount2).vote([otherAccount.address], [10])


            await poll.settleCurrentPollAndCreateNewPoll();

            const balance = await token.balanceOf(owner.address);
            expect(balance).to.eq(70 + 1500);
            const balance2 = await token.balanceOf(otherAccount2.address);
            expect(balance2).to.eq(30 + 1500);
            const balance3 = await token.balanceOf(otherAccount.address);
            expect(balance3).to.eq(5000);
        });

        it("投票が実施された場合、投票者と貢献者にトークンが送られる(3)", async function () {
            // パターン3: 
            // - 投票者が2人 (owner, otherAccount2)
            // - 貢献者が1人 (otherAccount)
            // SUPPORTER_ASSIGNMENT_TOKEN = 5に設定し、割り切れないケース
            // 割り切れない場合は余りを無視して計算する(ex: 5 / 2 = 2)
            const { token, owner, poll, otherAccount, otherAccount2 } = await loadFixture(deploy);

            await poll.setSupporterAssignmentToken(5);
            await token.transfer(otherAccount2.address, 30);
            await poll.connect(otherAccount).candidateToContributionPoll()
            await poll.vote([otherAccount.address], [5])
            await poll.connect(otherAccount2).vote([otherAccount.address], [10])


            await poll.settleCurrentPollAndCreateNewPoll();

            const balance = await token.balanceOf(owner.address);
            expect(balance).to.eq(70 + 2);
            const balance2 = await token.balanceOf(otherAccount2.address);
            expect(balance2).to.eq(30 + 2);
            const balance3 = await token.balanceOf(otherAccount.address);
            expect(balance3).to.eq(5000);
        });

        it("投票が実施された場合、投票者と貢献者にトークンが送られる(4)", async function () {
            // パターン4: 
            // - 投票者が1人 (owner)
            // - 貢献者が2人 (otherAccount, otherAccount2)
            const { token, owner, poll, otherAccount, otherAccount2 } = await loadFixture(deploy);

            await poll.connect(otherAccount).candidateToContributionPoll()
            await poll.connect(otherAccount2).candidateToContributionPoll()
            await poll.vote([otherAccount.address, otherAccount2.address], [2, 3])

            await poll.settleCurrentPollAndCreateNewPoll();

            const balance = await token.balanceOf(owner.address);
            expect(balance).to.eq(100 + 3000);
            const balance2 = await token.balanceOf(otherAccount.address);
            expect(balance2).to.eq(2000);
            const balance3 = await token.balanceOf(otherAccount2.address);
            expect(balance3).to.eq(3000);
        });

        it("投票が実施された場合、投票者と貢献者にトークンが送られる(5)", async function () {
            // パターン5: 
            // - 投票者が2人 (owner, otherAccount)
            // - 貢献者が2人 (otherAccount, otherAccount2)
            const { token, owner, poll, otherAccount, otherAccount2 } = await loadFixture(deploy);

            await token.transfer(otherAccount.address, 30);
            await poll.connect(otherAccount).candidateToContributionPoll()
            await poll.connect(otherAccount2).candidateToContributionPoll()
            await poll.vote([otherAccount.address, otherAccount2.address], [1, 1])
            await poll.connect(otherAccount).vote([otherAccount.address, otherAccount2.address], [0, 1])

            await poll.settleCurrentPollAndCreateNewPoll();

            const balance = await token.balanceOf(owner.address);
            expect(balance).to.eq(70 + 1500);
            const balance2 = await token.balanceOf(otherAccount.address);
            expect(balance2).to.eq(30 + 1500 + 1250);
            const balance3 = await token.balanceOf(otherAccount2.address);
            expect(balance3).to.eq(3750);
        });
    });
});
